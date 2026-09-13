import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import {
  crearReserva,
  cancelarCita,
  reprogramarCita,
  puedeGestionarseAutomaticamente,
  MINUTOS_MINIMOS_CANCELACION_AUTOMATICA,
  normalizarTelefono,
  ReservaError,
} from "@/lib/booking";

// Revisa de vez en cuando en la documentación de Anthropic
// (platform.claude.com/docs) si hay un modelo más reciente recomendado.
const MODEL = "claude-sonnet-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface EjecutarAsistenteParams {
  conversacionId: string;
  telefono: string;
  historial: { remitente: "cliente" | "ia" | "gestor"; contenido: string }[];
  mensajeNuevo: string;
}

interface ResultadoAsistente {
  respuesta: string;
  escalar: boolean;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_disponibilidad",
    description:
      "Consulta los huecos libres reales para un servicio en una sede y fecha concretas. Úsalo siempre antes de proponer una hora al cliente; nunca inventes horarios.",
    input_schema: {
      type: "object",
      properties: {
        sede: { type: "string", description: "Nombre o slug de la sede: 'Los Molinos' o 'Avenida de las Ciudades'." },
        servicio: { type: "string", description: "Nombre del servicio, tal como aparece en el catálogo." },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD." },
      },
      required: ["sede", "servicio", "fecha"],
    },
  },
  {
    name: "crear_cita",
    description:
      "Crea la cita en firme. Solo llama a esta función cuando el cliente ha confirmado explícitamente sede, servicio, fecha y hora exactos, y te ha dado su nombre. Antes de llamarla para uno de los 4 servicios principales (Corte, Barba, Corte y barba, Asesoría de prótesis capilar), ofrece al cliente añadir un complemento (ver regla en el prompt).",
    input_schema: {
      type: "object",
      properties: {
        sede: { type: "string" },
        servicio: { type: "string" },
        fecha: { type: "string", description: "YYYY-MM-DD" },
        hora: { type: "string", description: "HH:mm, en hora local de España" },
        nombre_cliente: { type: "string" },
        acepta_comunicaciones_comerciales: {
          type: "boolean",
          description:
            "true solo si el cliente ha dicho explícitamente que sí quiere recibir ofertas/novedades. Si no lo ha dicho o no lo has preguntado, usa false.",
        },
        complementos: {
          type: "array",
          items: { type: "string" },
          description:
            "Nombres de complementos que el cliente ha pedido añadir (opcional), tal cual aparecen en el catálogo: Cejas, Lavado, Masaje anti-estrés, Depilación de nariz.",
        },
      },
      required: ["sede", "servicio", "fecha", "hora", "nombre_cliente"],
    },
  },
  {
    name: "consultar_mis_citas",
    description:
      "Consulta las próximas citas confirmadas de este mismo cliente (por su número de WhatsApp). Úsalo siempre antes de cancelar_cita o reprogramar_cita si el cliente no ha dicho fecha y hora exactas de la cita que quiere tocar, para saber cuál es o preguntarle cuál si tiene varias.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancelar_cita",
    description:
      `Cancela una cita ya existente de este cliente. Solo puedes hacerlo tú directamente si faltan ${MINUTOS_MINIMOS_CANCELACION_AUTOMATICA} minutos o más para la cita; si falta menos, la herramienta te lo dirá y debes decirle al cliente que llame a la barbería.`,
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Fecha de la cita a cancelar, YYYY-MM-DD." },
        hora: { type: "string", description: "Hora de la cita a cancelar, HH:mm." },
      },
      required: ["fecha", "hora"],
    },
  },
  {
    name: "reprogramar_cita",
    description:
      `Mueve una cita ya existente de este cliente a otro día/hora. Consulta antes disponibilidad con consultar_disponibilidad para la nueva fecha. Solo puedes hacerlo tú directamente si faltan ${MINUTOS_MINIMOS_CANCELACION_AUTOMATICA} minutos o más para la cita ORIGINAL; si falta menos, la herramienta te lo dirá y debes decirle al cliente que llame a la barbería.`,
    input_schema: {
      type: "object",
      properties: {
        fecha_actual: { type: "string", description: "Fecha actual de la cita, YYYY-MM-DD." },
        hora_actual: { type: "string", description: "Hora actual de la cita, HH:mm." },
        fecha_nueva: { type: "string", description: "Nueva fecha deseada, YYYY-MM-DD." },
        hora_nueva: { type: "string", description: "Nueva hora deseada, HH:mm." },
      },
      required: ["fecha_actual", "hora_actual", "fecha_nueva", "hora_nueva"],
    },
  },
  {
    name: "escalar_a_persona",
    description:
      "Pasa la conversación a una persona del equipo cuando no puedas resolver la duda del cliente, se queje, pida algo fuera de lo que sabes gestionar, o lo pida explícitamente.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
      },
      required: ["motivo"],
    },
  },
];

async function construirSystemPrompt(): Promise<string> {
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("nombre, slug, direccion, telefono").eq("activo", true),
    supabase
      .from("servicios")
      .select("nombre, descripcion, duracion_minutos, precio_centimos")
      .eq("activo", true),
  ]);

  const sedesTexto = (sedes ?? [])
    .map((s) => `- ${s.nombre} (slug: ${s.slug})${s.direccion ? `, dirección: ${s.direccion}` : ""}`)
    .join("\n");
  const serviciosTexto = (servicios ?? [])
    .map(
      (s) =>
        `- ${s.nombre}: ${(s.precio_centimos / 100).toFixed(2)}€, ${s.duracion_minutos} min${
          s.descripcion ? ` — ${s.descripcion}` : ""
        }`
    )
    .join("\n");

  const hoy = new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });

  return `Eres el asistente de WhatsApp de Barbería Grasso, una barbería con dos sedes en España.
Hoy es ${hoy} (hora de España). Respondes siempre en español, de forma cercana, breve y profesional, como lo haría alguien del equipo por WhatsApp (frases cortas, sin emojis en exceso).

SEDES:
${sedesTexto || "(sin sedes configuradas todavía)"}

SERVICIOS Y PRECIOS:
${serviciosTexto || "(sin servicios configurados todavía)"}

REGLAS IMPORTANTES:
- Nunca inventes horarios disponibles: usa siempre la herramienta consultar_disponibilidad antes de proponer una hora.
- Para reservar, necesitas: sede, servicio, fecha, hora exacta confirmada por el cliente, su nombre, los complementos (ver regla siguiente) y su respuesta sobre si quiere recibir ofertas y novedades por WhatsApp. Pregunta TODO esto —incluida la de las ofertas— antes de dar ningún resumen; nunca la dejes para después. En cuanto tengas todos esos datos, llama a crear_cita en ese mismo turno: no des nunca un mensaje tipo "Confirmo: ..." sin haber llamado ya a crear_cita, porque el cliente lo entenderá como que la cita ya está hecha. El mensaje que resume la cita al cliente debe ir siempre DESPUÉS de que la herramienta te confirme que se ha creado correctamente, nunca antes.
- Complementos: si el cliente va a reservar uno de los 4 servicios principales (Corte, Barba, Corte y barba, Asesoría de prótesis capilar), antes de confirmar la cita pregúntale si quiere añadir algún complemento (Cejas, Lavado, Masaje anti-estrés, Depilación de nariz), como haría alguien del equipo al cogerle hora. Si dice que no o no contesta a eso, sigue sin complementos sin insistir. Si el cliente reserva directamente un complemento suelto o cualquier otro servicio que no sea uno de los 4 principales, no hace falta que ofrezcas nada más.
- Cancelar o reprogramar una cita: usa consultar_mis_citas si el cliente no te ha dado ya la fecha y hora exactas de la cita que quiere tocar. Luego usa cancelar_cita o reprogramar_cita. Estas herramientas comprueban solas si queda margen suficiente; si no, te lo dirán y entonces debes decirle al cliente que llame directamente a la barbería para gestionarlo, sin escalar la conversación.
- Si el cliente pide algo que no puedes resolver tú (una queja, un descuento, una duda muy específica, o cualquier otra gestión que no sea crear/cancelar/reprogramar una cita), usa escalar_a_persona y dile al cliente que alguien del equipo le va a escribir.
- Nunca compartas datos de otros clientes.
- Sé proactivo: si el cliente solo saluda o pregunta algo general, ayúdale a decidir sede, servicio y fecha antes de mostrar horas.`;
}

function resolverSedeId(nombre: string, sedes: { id: string; nombre: string; slug: string }[]) {
  const normal = nombre.toLowerCase();
  return sedes.find(
    (s) => s.nombre.toLowerCase().includes(normal) || s.slug.toLowerCase().includes(normal) || normal.includes(s.slug)
  );
}

function resolverServicioId(nombre: string, servicios: { id: string; nombre: string }[]) {
  const normal = nombre.toLowerCase();
  return servicios.find(
    (s) => s.nombre.toLowerCase().includes(normal) || normal.includes(s.nombre.toLowerCase())
  );
}

async function ejecutarHerramienta(
  nombre: string,
  input: Record<string, unknown>,
  telefono: string
): Promise<{ resultado: string; escalar: boolean }> {
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, slug").eq("activo", true),
    supabase.from("servicios").select("id, nombre").eq("activo", true),
  ]);

  if (nombre === "consultar_disponibilidad") {
    const sede = resolverSedeId(String(input.sede ?? ""), sedes ?? []);
    const servicio = resolverServicioId(String(input.servicio ?? ""), servicios ?? []);
    if (!sede || !servicio) {
      return { resultado: "No he reconocido esa sede o servicio. Revisa el nombre exacto del catálogo.", escalar: false };
    }
    const slots = await getAvailableSlots({ sedeId: sede.id, servicioId: servicio.id, fecha: String(input.fecha) });
    if (slots.length === 0) {
      return { resultado: "No quedan huecos libres ese día para ese servicio en esa sede.", escalar: false };
    }
    const horas = Array.from(new Set(slots.map((s) => s.hora_inicio)))
      .slice(0, 12)
      .map((iso) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }));
    return { resultado: `Horas libres: ${horas.join(", ")}`, escalar: false };
  }

  if (nombre === "crear_cita") {
    const sede = resolverSedeId(String(input.sede ?? ""), sedes ?? []);
    const servicio = resolverServicioId(String(input.servicio ?? ""), servicios ?? []);
    if (!sede || !servicio) {
      return { resultado: "No he reconocido esa sede o servicio.", escalar: false };
    }
    const fecha = String(input.fecha);
    const hora = String(input.hora);
    const horaInicioISO = new Date(
      new Date(`${fecha}T${hora}:00+02:00`).toISOString()
    ).toISOString();

    const nombresComplementos = Array.isArray(input.complementos) ? (input.complementos as unknown[]) : [];
    const complementoIds = nombresComplementos
      .map((c) => resolverServicioId(String(c), servicios ?? []))
      .filter((s): s is { id: string; nombre: string } => Boolean(s))
      .map((s) => s.id);

    try {
      const { cita } = await crearReserva({
        sedeId: sede.id,
        servicioId: servicio.id,
        fecha,
        horaInicioISO,
        cliente: { nombre: String(input.nombre_cliente ?? "Cliente WhatsApp"), telefono },
        aceptaComercial: Boolean(input.acepta_comunicaciones_comerciales),
        canal: "whatsapp",
        origen: "whatsapp",
        complementoIds,
      });
      return {
        resultado: `Cita creada correctamente para el ${fecha} a las ${hora} en ${sede.nombre}. ID: ${cita.id}`,
        escalar: false,
      };
    } catch (err) {
      if (err instanceof ReservaError) {
        return { resultado: `No se pudo crear la cita: ${err.message}`, escalar: false };
      }
      return { resultado: "Ha ocurrido un error técnico al crear la cita.", escalar: true };
    }
  }

  if (nombre === "consultar_mis_citas") {
    const citas = await buscarCitasFuturasDelCliente(telefono);
    if (citas.length === 0) {
      return { resultado: "Este cliente no tiene ninguna cita próxima confirmada.", escalar: false };
    }
    const lista = citas
      .map((c) => `- ${formatoFechaHora(c.inicio)}: ${c.servicioNombre} en ${c.sedeNombre}`)
      .join("\n");
    return { resultado: `Próximas citas del cliente:\n${lista}`, escalar: false };
  }

  if (nombre === "cancelar_cita") {
    const cita = await encontrarCitaPorFechaHora(telefono, String(input.fecha), String(input.hora));
    if (!cita) {
      return { resultado: "No encuentro ninguna cita confirmada de este cliente en esa fecha y hora.", escalar: false };
    }
    if (!puedeGestionarseAutomaticamente(cita.inicio)) {
      return {
        resultado: `Falta menos de ${MINUTOS_MINIMOS_CANCELACION_AUTOMATICA} minutos para esa cita: no la canceles tú, dile al cliente que llame directamente a la barbería.`,
        escalar: false,
      };
    }
    try {
      await cancelarCita(cita.id);
      return { resultado: "Cita cancelada correctamente.", escalar: false };
    } catch {
      return { resultado: "Ha ocurrido un error técnico al cancelar la cita.", escalar: true };
    }
  }

  if (nombre === "reprogramar_cita") {
    const cita = await encontrarCitaPorFechaHora(telefono, String(input.fecha_actual), String(input.hora_actual));
    if (!cita) {
      return { resultado: "No encuentro ninguna cita confirmada de este cliente en esa fecha y hora.", escalar: false };
    }
    if (!puedeGestionarseAutomaticamente(cita.inicio)) {
      return {
        resultado: `Falta menos de ${MINUTOS_MINIMOS_CANCELACION_AUTOMATICA} minutos para esa cita: no la reprogromes tú, dile al cliente que llame directamente a la barbería.`,
        escalar: false,
      };
    }
    const fechaNueva = String(input.fecha_nueva);
    const horaNueva = String(input.hora_nueva);
    const nuevaHoraInicioISO = new Date(new Date(`${fechaNueva}T${horaNueva}:00+02:00`).toISOString()).toISOString();
    try {
      await reprogramarCita({ citaId: cita.id, nuevaHoraInicioISO });
      return { resultado: `Cita movida correctamente al ${fechaNueva} a las ${horaNueva}.`, escalar: false };
    } catch (err) {
      if (err instanceof ReservaError) {
        return { resultado: `No se pudo reprogramar: ${err.message}`, escalar: false };
      }
      return { resultado: "Ha ocurrido un error técnico al reprogramar la cita.", escalar: true };
    }
  }

  if (nombre === "escalar_a_persona") {
    return { resultado: "Conversación marcada para que la atienda una persona.", escalar: true };
  }

  return { resultado: "Herramienta desconocida.", escalar: false };
}

async function buscarCitasFuturasDelCliente(telefono: string) {
  const supabase = createAdminClient();
  const telefonoNormalizado = normalizarTelefono(telefono);
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono", telefonoNormalizado)
    .maybeSingle();
  if (!cliente) return [];

  const { data: citas } = await supabase
    .from("citas")
    .select("id, inicio, servicio:servicios(nombre), sede:sedes(nombre)")
    .eq("cliente_id", cliente.id)
    .eq("estado", "confirmada")
    .gt("inicio", new Date().toISOString())
    .order("inicio");

  return (citas ?? []).map((c) => {
    const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
    const sede = Array.isArray(c.sede) ? c.sede[0] : c.sede;
    return {
      id: c.id as string,
      inicio: c.inicio as string,
      servicioNombre: (servicio as { nombre: string } | null)?.nombre ?? "Servicio",
      sedeNombre: (sede as { nombre: string } | null)?.nombre ?? "Sede",
    };
  });
}

async function encontrarCitaPorFechaHora(telefono: string, fecha: string, hora: string) {
  const citas = await buscarCitasFuturasDelCliente(telefono);
  const objetivoISO = new Date(new Date(`${fecha}T${hora}:00+02:00`).toISOString()).toISOString();
  return citas.find((c) => c.inicio === objetivoISO) ?? null;
}

function formatoFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function ejecutarAsistente({
  telefono,
  historial,
  mensajeNuevo,
}: EjecutarAsistenteParams): Promise<ResultadoAsistente> {
  const system = await construirSystemPrompt();

  const messages: Anthropic.MessageParam[] = [
    ...historial.slice(-12).map((m) => ({
      role: (m.remitente === "cliente" ? "user" : "assistant") as "user" | "assistant",
      content: m.contenido,
    })),
    { role: "user", content: mensajeNuevo },
  ];

  let escalar = false;

  for (let iteracion = 0; iteracion < 4; iteracion++) {
    const respuesta = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const bloquesTexto = respuesta.content.filter((b) => b.type === "text") as Anthropic.TextBlock[];
    const bloquesHerramienta = respuesta.content.filter(
      (b) => b.type === "tool_use"
    ) as Anthropic.ToolUseBlock[];

    if (bloquesHerramienta.length === 0) {
      const texto = bloquesTexto.map((b) => b.text).join("\n").trim();
      return { respuesta: texto || "Un momento, ya te contesto.", escalar };
    }

    messages.push({ role: "assistant", content: respuesta.content });

    const resultadosHerramientas: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of bloquesHerramienta) {
      const { resultado, escalar: escalarAhora } = await ejecutarHerramienta(
        bloque.name,
        bloque.input as Record<string, unknown>,
        telefono
      );
      if (escalarAhora) escalar = true;
      resultadosHerramientas.push({
        type: "tool_result",
        tool_use_id: bloque.id,
        content: resultado,
      });
    }
    messages.push({ role: "user", content: resultadosHerramientas });
  }

  return {
    respuesta: "Ahora mismo no puedo resolverlo, pero una persona del equipo te va a escribir enseguida.",
    escalar: true,
  };
}

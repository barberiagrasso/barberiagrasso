import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import { crearReserva, ReservaError } from "@/lib/booking";

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
      "Crea la cita en firme. Solo llama a esta función cuando el cliente ha confirmado explícitamente sede, servicio, fecha y hora exactos, y te ha dado su nombre.",
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
      },
      required: ["sede", "servicio", "fecha", "hora", "nombre_cliente"],
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
- Para reservar, necesitas: sede, servicio, fecha, hora exacta confirmada por el cliente, y su nombre. Solo entonces llama a crear_cita.
- Si el cliente quiere cambiar o cancelar una cita ya existente, o pide algo que no puedes resolver tú (una queja, un descuento, una duda muy específica), usa escalar_a_persona y dile al cliente que alguien del equipo le va a escribir.
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

  if (nombre === "escalar_a_persona") {
    return { resultado: "Conversación marcada para que la atienda una persona.", escalar: true };
  }

  return { resultado: "Herramienta desconocida.", escalar: false };
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

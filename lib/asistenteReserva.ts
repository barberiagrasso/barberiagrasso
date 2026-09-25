import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots, buscarProximoDiaConHueco } from "@/lib/availability";
import { fechaEnMadrid, horaEnMadrid, minutosDeHora } from "@/lib/horarioLocal";
import type { FranjaDisponible } from "@/lib/types";

// =====================================================================
// "¿Qué deseas?" — pantalla nueva pedida por Diego (25/09/2026) antes del
// paso a paso de app/reservar: el cliente escribe en una frase lo que
// quiere y esto le propone una cita YA CONCRETA (sede, servicio, día,
// hora y profesional reales) para que solo tenga que darle a "Elegir
// esta cita", o escribir feedback y que se lo vuelva a proponer.
//
// A propósito NUNCA reserva nada por su cuenta (a diferencia del
// asistente de WhatsApp de lib/aiAssistant.ts, que sí crea la cita él
// mismo): aquí la IA solo interpreta el texto y busca huecos REALES con
// el mismo motor de disponibilidad que usa el resto de la app
// (lib/availability.ts) — nunca inventa horarios. La reserva en firme la
// sigue haciendo /api/citas cuando el cliente confirma, exactamente
// igual que si la hubiera elegido a mano en el paso a paso.
// =====================================================================

const MODEL = "claude-sonnet-5";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cuántas alternativas como mucho se le ofrecen al cliente cuando no hay
// hueco exacto para lo que pidió (decisión de Diego, 25/09/2026: mejor
// proponerle algo parecido que dejarle con las manos vacías).
const MAX_ALTERNATIVAS = 3;

export interface TurnoConversacionAsistente {
  remitente: "cliente" | "ia";
  contenido: string;
}

export interface OpcionPropuestaCita {
  sedeId: string;
  sedeNombre: string;
  servicioId: string;
  servicioNombre: string;
  complementoIds: string[];
  complementoNombres: string[];
  profesionalId: string;
  profesionalNombre: string;
  // true solo si el cliente pidió expresamente ese profesional por
  // nombre — controla el corazón de "elegido por el cliente" en la
  // Agenda, igual que en el paso a paso manual.
  profesionalElegidoPorCliente: boolean;
  fecha: string; // YYYY-MM-DD
  horaInicioISO: string;
  precioTotalCentimos: number;
  precioEsVariable: boolean;
}

export type ResultadoAsistenteReserva =
  | { tipo: "duda"; mensaje: string }
  | { tipo: "propuesta"; mensaje: string; opciones: OpcionPropuestaCita[] }
  | { tipo: "sin_disponibilidad"; mensaje: string }
  | { tipo: "error"; mensaje: string };

const HERRAMIENTA_EXTRAER: Anthropic.Tool = {
  name: "extraer_peticion",
  description:
    "Interpreta lo que acaba de escribir el cliente (y la conversación previa) y devuelve, de forma estructurada, qué le gustaría reservar. Sé generoso interpretando: solo pide aclaración si de verdad no se puede adivinar qué SERVICIO quiere.",
  input_schema: {
    type: "object",
    properties: {
      servicio: {
        type: ["string", "null"],
        description: "Nombre EXACTO de un servicio del catálogo (el que mejor encaje), o null si no se puede determinar en absoluto.",
      },
      sede: {
        type: ["string", "null"],
        description: "Nombre EXACTO de una sede del catálogo si el cliente la menciona, o null si no dice nada (se buscará en todas).",
      },
      profesional: {
        type: ["string", "null"],
        description: "Nombre de un profesional si el cliente pide expresamente que le atienda alguien en concreto, o null.",
      },
      fecha: {
        type: ["string", "null"],
        description:
          "Fecha deseada en formato YYYY-MM-DD, resuelta con criterio respecto a la fecha de HOY indicada en tus instrucciones (p.ej. 'mañana', 'el viernes', 'la semana que viene'). null si no dice ninguna fecha o dice algo como 'cuanto antes'.",
      },
      hora_aproximada: {
        type: ["string", "null"],
        description:
          "Hora concreta o franja aproximada en formato HH:mm (p.ej. 'por la tarde' → '17:00', 'a primera hora' → '09:30', 'a mediodía' → '13:00'), o null si no da ninguna pista de hora.",
      },
      complementos: {
        type: "array",
        items: { type: "string" },
        description: "Nombres EXACTOS de complementos del catálogo que el cliente pide añadir explícitamente, si los hay.",
      },
      necesita_aclaracion: {
        type: "boolean",
        description: "true SOLO si no se puede determinar en absoluto qué servicio quiere.",
      },
      pregunta_aclaracion: {
        type: ["string", "null"],
        description: "Si necesita_aclaracion es true, una pregunta breve y amable para el cliente. Si no, null.",
      },
    },
    required: ["servicio", "sede", "profesional", "fecha", "hora_aproximada", "complementos", "necesita_aclaracion", "pregunta_aclaracion"],
  },
};

interface PeticionExtraida {
  servicio: string | null;
  sede: string | null;
  profesional: string | null;
  fecha: string | null;
  hora_aproximada: string | null;
  complementos: string[];
  necesita_aclaracion: boolean;
  pregunta_aclaracion: string | null;
}

export function resolverPorNombre<T extends { nombre: string }>(nombre: string, catalogo: T[]): T | undefined {
  const normal = nombre.toLowerCase().trim();
  return (
    catalogo.find((c) => c.nombre.toLowerCase() === normal) ??
    catalogo.find((c) => c.nombre.toLowerCase().includes(normal) || normal.includes(c.nombre.toLowerCase()))
  );
}

async function extraerPeticion(
  historial: TurnoConversacionAsistente[],
  mensajeNuevo: string,
  sedes: { nombre: string }[],
  servicios: { nombre: string; precio_centimos: number; duracion_minutos: number }[]
): Promise<PeticionExtraida> {
  const hoy = fechaEnMadrid(new Date().toISOString());
  const hoyTexto = new Date(`${hoy}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });

  const sedesTexto = sedes.map((s) => `- ${s.nombre}`).join("\n");
  const serviciosTexto = servicios
    .map((s) => `- ${s.nombre} (${(s.precio_centimos / 100).toFixed(2)}€, ${s.duracion_minutos} min)`)
    .join("\n");

  const system = `Ayudas a los clientes de Barbería Grasso a describir en una frase la cita que quieren, para que la app les proponga un hueco real. Hoy es ${hoyTexto} (fecha ${hoy}, hora de España).

SEDES:
${sedesTexto || "(sin sedes configuradas)"}

SERVICIOS:
${serviciosTexto || "(sin servicios configurados)"}

Llama SIEMPRE a la herramienta extraer_peticion con lo que hayas entendido. No inventes horarios ni confirmes nada tú: solo interpretas.`;

  const messages: Anthropic.MessageParam[] = [
    ...historial.slice(-8).map((m) => ({
      role: (m.remitente === "cliente" ? "user" : "assistant") as "user" | "assistant",
      content: m.contenido,
    })),
    { role: "user", content: mensajeNuevo },
  ];

  const respuesta = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    tools: [HERRAMIENTA_EXTRAER],
    tool_choice: { type: "tool", name: "extraer_peticion" },
    messages,
  });

  const bloque = respuesta.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!bloque) {
    return {
      servicio: null,
      sede: null,
      profesional: null,
      fecha: null,
      hora_aproximada: null,
      complementos: [],
      necesita_aclaracion: true,
      pregunta_aclaracion: "¿Qué te gustaría reservar?",
    };
  }
  return bloque.input as PeticionExtraida;
}

// Uno por hora (si "cualquiera" hay varios profesionales libres a la vez,
// se enseña una sola opción) — mismo criterio que "horasUnicas" en
// app/reservar/BookingFlow.tsx, para no abrumar con 3 barberos a la
// misma hora como si fueran alternativas distintas.
export function franjasUnicasPorHora(franjas: FranjaDisponible[]): FranjaDisponible[] {
  const mapa = new Map<string, FranjaDisponible>();
  for (const f of franjas) {
    if (!mapa.has(f.hora_inicio)) mapa.set(f.hora_inicio, f);
  }
  return Array.from(mapa.values());
}

export function ordenarPorCercania(franjas: FranjaDisponible[], minutosObjetivo: number | null): FranjaDisponible[] {
  if (minutosObjetivo === null) {
    return [...franjas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }
  return [...franjas].sort((a, b) => {
    const da = Math.abs(minutosDeHora(horaEnMadrid(a.hora_inicio)) - minutosObjetivo);
    const db = Math.abs(minutosDeHora(horaEnMadrid(b.hora_inicio)) - minutosObjetivo);
    return da - db;
  });
}

/**
 * Punto de entrada: interpreta el texto del cliente y devuelve una
 * propuesta de cita ya concreta (o hasta 3 alternativas cercanas si no
 * hay hueco exacto), sin reservar nada — ver cabecera del archivo.
 */
export async function proponerCita(
  historial: TurnoConversacionAsistente[],
  mensajeNuevo: string
): Promise<ResultadoAsistenteReserva> {
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }, { data: profesionales }] = await Promise.all([
    supabase.from("sedes").select("id, nombre").eq("activo", true),
    supabase
      .from("servicios")
      .select("id, nombre, precio_centimos, duracion_minutos, precio_variable, categoria")
      .eq("activo", true),
    supabase.from("profesionales").select("id, nombre").eq("activo", true),
  ]);

  const sedesActivas = sedes ?? [];
  const serviciosActivos = servicios ?? [];
  const profesionalesActivos = profesionales ?? [];

  if (sedesActivas.length === 0 || serviciosActivos.length === 0) {
    return { tipo: "error", mensaje: "Ahora mismo no se puede reservar online. Llama directamente a la barbería." };
  }

  const peticion = await extraerPeticion(historial, mensajeNuevo, sedesActivas, serviciosActivos);

  if (peticion.necesita_aclaracion || !peticion.servicio) {
    return { tipo: "duda", mensaje: peticion.pregunta_aclaracion || "¿Qué te gustaría reservar?" };
  }

  const servicio = resolverPorNombre(peticion.servicio, serviciosActivos);
  if (!servicio) {
    return { tipo: "duda", mensaje: "¿Qué servicio te gustaría reservar? Por ejemplo: Corte, Barba, Corte y barba…" };
  }

  const complementosCatalogo = serviciosActivos.filter((s) => s.categoria === "Complementos");
  const complementosResueltos = peticion.complementos
    .map((nombre) => resolverPorNombre(nombre, complementosCatalogo))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.id !== servicio.id);
  const complementoIds = complementosResueltos.map((c) => c.id);
  const complementoNombres = complementosResueltos.map((c) => c.nombre);
  const duracionExtraMinutos = complementosResueltos.reduce((acc, c) => acc + c.duracion_minutos, 0);
  const precioTotalCentimos = servicio.precio_centimos + complementosResueltos.reduce((acc, c) => acc + c.precio_centimos, 0);
  const precioEsVariable = Boolean(servicio.precio_variable) || complementosResueltos.some((c) => c.precio_variable);

  const sedeResuelta = peticion.sede ? resolverPorNombre(peticion.sede, sedesActivas) : undefined;
  const sedesCandidatas = sedeResuelta ? [sedeResuelta] : sedesActivas;

  const profesionalResuelto = peticion.profesional ? resolverPorNombre(peticion.profesional, profesionalesActivos) : undefined;
  const profesionalId = profesionalResuelto?.id;
  const profesionalElegidoPorCliente = Boolean(profesionalResuelto);

  const minutosObjetivo = peticion.hora_aproximada ? minutosDeHora(peticion.hora_aproximada) : null;

  function construirOpcion(sede: { id: string; nombre: string }, fecha: string, franja: FranjaDisponible): OpcionPropuestaCita {
    return {
      sedeId: sede.id,
      sedeNombre: sede.nombre,
      servicioId: servicio!.id,
      servicioNombre: servicio!.nombre,
      complementoIds,
      complementoNombres,
      profesionalId: franja.profesional_id,
      profesionalNombre: franja.profesional_nombre,
      profesionalElegidoPorCliente,
      fecha,
      horaInicioISO: franja.hora_inicio,
      precioTotalCentimos,
      precioEsVariable,
    };
  }

  // Fecha concreta pedida (y no ya pasada): se busca ESE día en las
  // sedes candidatas antes de rendirse y saltar a "próximo día libre".
  const hoy = fechaEnMadrid(new Date().toISOString());
  const fechaPedida = peticion.fecha && peticion.fecha >= hoy ? peticion.fecha : null;

  if (fechaPedida) {
    const porSede = await Promise.all(
      sedesCandidatas.map(async (sede) => ({
        sede,
        franjas: await getAvailableSlots({ sedeId: sede.id, servicioId: servicio.id, fecha: fechaPedida, profesionalId, duracionExtraMinutos }),
      }))
    );
    const conHuecos = porSede.filter((p) => p.franjas.length > 0);

    if (conHuecos.length > 0) {
      // Si pidió sede, esa es la única candidata; si no, se prioriza la
      // primera con hueco (orden del catálogo) para no mezclar sedes en
      // la misma tanda de alternativas.
      const { sede, franjas } = conHuecos[0];
      const unicas = franjasUnicasPorHora(franjas);

      if (minutosObjetivo !== null) {
        const exacta = unicas.find((f) => minutosDeHora(horaEnMadrid(f.hora_inicio)) === minutosObjetivo);
        if (exacta) {
          return {
            tipo: "propuesta",
            mensaje: `Te proponemos esta cita el ${formatoFechaLarga(fechaPedida)}:`,
            opciones: [construirOpcion(sede, fechaPedida, exacta)],
          };
        }
        const cercanas = ordenarPorCercania(unicas, minutosObjetivo).slice(0, MAX_ALTERNATIVAS);
        return {
          tipo: "propuesta",
          mensaje: `Ese día no había hueco justo a esa hora, pero sí a estas horas cercanas (${formatoFechaLarga(fechaPedida)}):`,
          opciones: cercanas.map((f) => construirOpcion(sede, fechaPedida, f)),
        };
      }

      const masTemprana = ordenarPorCercania(unicas, null)[0];
      return {
        tipo: "propuesta",
        mensaje: `Te proponemos esta cita el ${formatoFechaLarga(fechaPedida)}:`,
        opciones: [construirOpcion(sede, fechaPedida, masTemprana)],
      };
    }
  }

  // Sin hueco ese día concreto (o sin fecha pedida: "cuanto antes") — se
  // busca el próximo día con hueco real, sede a sede, y se usa la que
  // antes tenga disponibilidad.
  const desde = fechaPedida ?? hoy;
  const resultadosProximo = await Promise.all(
    sedesCandidatas.map(async (sede) => ({
      sede,
      resultado: await buscarProximoDiaConHueco({ sedeId: sede.id, servicioId: servicio.id, profesionalId, desde, duracionExtraMinutos }),
    }))
  );
  const conResultado = resultadosProximo
    .filter((r): r is { sede: { id: string; nombre: string }; resultado: NonNullable<(typeof resultadosProximo)[number]["resultado"]> } => Boolean(r.resultado))
    .sort((a, b) => a.resultado.fecha.localeCompare(b.resultado.fecha));

  if (conResultado.length === 0) {
    return {
      tipo: "sin_disponibilidad",
      mensaje: "No encontramos ningún hueco libre para ese servicio en los próximos meses. Llama directamente a la barbería y te ayudamos a buscar algo.",
    };
  }

  const { sede, resultado } = conResultado[0];
  const unicas = franjasUnicasPorHora(resultado.slots);
  const ordenadas = ordenarPorCercania(unicas, minutosObjetivo).slice(0, minutosObjetivo !== null ? MAX_ALTERNATIVAS : 1);
  const prefijo = fechaPedida
    ? `Ese día no quedaba ningún hueco libre. El próximo día con hueco es el ${formatoFechaLarga(resultado.fecha)}:`
    : `Aquí tienes la cita más próxima disponible, el ${formatoFechaLarga(resultado.fecha)}:`;

  return {
    tipo: "propuesta",
    mensaje: prefijo,
    opciones: ordenadas.map((f) => construirOpcion(sede, resultado.fecha, f)),
  };
}

export function formatoFechaLarga(fechaYMD: string): string {
  return new Date(`${fechaYMD}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Madrid",
  });
}

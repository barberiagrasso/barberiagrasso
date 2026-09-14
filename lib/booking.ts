import "server-only";
import { addMinutes } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import { buscarOCrearCliente, normalizarTelefono } from "@/lib/clientes";
import { sincronizarClienteHubSpot, sincronizarCitaHubSpot } from "@/lib/hubspot";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { canjearSaldoEnCita, reembolsarSaldoDeCita, saldoDelCliente, SaldoInsuficienteError } from "@/lib/fidelizacion";
import type { CanalConsentimiento } from "@/lib/types";

// Fecha "YYYY-MM-DD" de un instante ISO en la zona horaria del negocio
// (Europe/Madrid) — la misma noción de "día" que usa lib/availability.ts
// y que el cliente elige en el flujo de reserva. Necesaria porque
// citas.inicio se guarda en UTC y puede caer en otro día de calendario
// cerca de medianoche.
function fechaMadrid(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

// Re-exportado por compatibilidad: varios módulos (webhook de WhatsApp,
// aiAssistant) siguen importando normalizarTelefono desde aquí. La
// implementación real vive en lib/clientes.ts junto al resto de lógica
// de "quién es este cliente".
export { normalizarTelefono };

export const TEXTO_CONSENTIMIENTO_OPERATIVO =
  "Acepto que Barbería Grasso trate mis datos (nombre y teléfono) para gestionar esta cita.";
export const TEXTO_CONSENTIMIENTO_COMERCIAL =
  "Acepto recibir ofertas y comunicaciones comerciales de Barbería Grasso por WhatsApp, email o notificaciones. Puedo darme de baja cuando quiera.";

interface DatosCliente {
  nombre: string;
  telefono: string;
  email?: string | null;
}

interface CrearReservaParams {
  sedeId: string;
  servicioId: string;
  profesionalId?: string | null;
  fecha: string; // "YYYY-MM-DD"
  horaInicioISO: string; // ISO UTC, debe coincidir con un slot disponible
  cliente: DatosCliente;
  aceptaComercial: boolean;
  canal: CanalConsentimiento;
  origen: "app" | "panel" | "whatsapp";
  // Complementos añadidos al servicio principal en el paso extra de la
  // reserva (p. ej. cejas, lavado). Amplían el hueco bloqueado en la
  // agenda y quedan anotados en la cita para que el barbero cobre bien.
  complementoIds?: string[];
  // Si es true, el cliente paga el total de la cita con su saldo de
  // fidelización en vez de en efectivo/tarjeta. Solo se admite si el
  // saldo cubre el total exacto (ver lib/fidelizacion.ts) — no hay canje
  // parcial.
  pagarConSaldo?: boolean;
}

export class ReservaError extends Error {}

interface ApuntarseListaEsperaParams {
  sedeId: string;
  servicioId: string;
  // null/omitido = le vale cualquier profesional de la sede.
  profesionalId?: string | null;
  fecha: string; // "YYYY-MM-DD", el mismo día que el cliente veía sin huecos
  cliente: DatosCliente;
  aceptaComercial: boolean;
  canal: CanalConsentimiento;
}

/**
 * Apunta a un cliente a la lista de espera de un día sin huecos. Se usa
 * desde el paso de fecha de app/reservar cuando la búsqueda de huecos
 * viene vacía. Si el mismo cliente ya estaba apuntado a lo mismo, no
 * duplica la fila: simplemente devuelve la que ya había.
 */
export async function apuntarseListaEspera(params: ApuntarseListaEsperaParams) {
  const supabase = createAdminClient();

  const { clienteId, esNuevo } = await buscarOCrearCliente(supabase, {
    nombre: params.cliente.nombre,
    telefono: params.cliente.telefono,
    email: params.cliente.email,
    sedeId: params.sedeId,
  });

  if (esNuevo) {
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "operativo",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_OPERATIVO,
    });
  }
  if (params.aceptaComercial) {
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "comercial",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_COMERCIAL,
    });
  }

  const { data: existente } = await supabase
    .from("lista_espera")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("sede_id", params.sedeId)
    .eq("servicio_id", params.servicioId)
    .eq("fecha", params.fecha)
    .eq("estado", "pendiente")
    .maybeSingle();
  if (existente) return { entrada: existente };

  const { data: entrada, error } = await supabase
    .from("lista_espera")
    .insert({
      cliente_id: clienteId,
      sede_id: params.sedeId,
      servicio_id: params.servicioId,
      profesional_id: params.profesionalId || null,
      fecha: params.fecha,
    })
    .select("*")
    .single();

  if (error || !entrada) throw new ReservaError("No se pudo apuntar a la lista de espera.");
  return { entrada };
}

// Cuántas personas de la lista de espera se avisan por cada hueco que se
// libera. Solo hay un hueco real, así que se avisa a los primeros en
// apuntarse (orden de llegada) en vez de a todos: si avisáramos a todos,
// varios competirían por la misma hora y la mayoría se llevaría un chasco.
// Quien reciba el aviso y no llegue a tiempo sigue disponible para el
// siguiente hueco que se libere ese mismo día (ver más abajo: queda
// "notificado", no "reservado").
const MAX_AVISOS_LISTA_ESPERA_POR_HUECO = 3;

/**
 * Al cancelarse una cita, avisa por WhatsApp a quien esté en la lista de
 * espera para ese mismo día, sede y servicio (y que no pidiera un
 * profesional distinto al que se ha quedado libre). Nunca lanza: un fallo
 * al avisar no debe impedir que la cancelación en sí se complete.
 */
async function notificarListaEsperaPorHueco(citaCancelada: {
  sede_id: string;
  servicio_id: string;
  profesional_id: string | null;
  inicio: string;
}) {
  try {
    const supabase = createAdminClient();
    const fecha = fechaMadrid(citaCancelada.inicio);

    let consulta = supabase
      .from("lista_espera")
      .select("id, cliente:clientes(nombre, telefono)")
      .eq("sede_id", citaCancelada.sede_id)
      .eq("servicio_id", citaCancelada.servicio_id)
      .eq("fecha", fecha)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: true })
      .limit(MAX_AVISOS_LISTA_ESPERA_POR_HUECO);

    // "Cualquiera" (profesional_id null) siempre encaja; si además había
    // pedido un profesional concreto, solo encaja si es justo el que ha
    // quedado libre.
    consulta = citaCancelada.profesional_id
      ? consulta.or(`profesional_id.is.null,profesional_id.eq.${citaCancelada.profesional_id}`)
      : consulta.is("profesional_id", null);

    const { data: candidatos } = await consulta;
    if (!candidatos || candidatos.length === 0) return;

    for (const candidato of candidatos) {
      const cliente = Array.isArray(candidato.cliente) ? candidato.cliente[0] : candidato.cliente;
      if (!cliente?.telefono) continue;
      const nombrePila = cliente.nombre?.split(" ")[0] || "";
      await sendWhatsAppMessage(
        cliente.telefono,
        `¡Hola${nombrePila ? " " + nombrePila : ""}! Se acaba de liberar un hueco el día que nos pediste en Barbería Grasso. Entra en https://barberiagrasso.es/reservar para cogerlo antes de que se lo lleve otra persona.`
      );
      await supabase
        .from("lista_espera")
        .update({ estado: "notificado", notificado_at: new Date().toISOString() })
        .eq("id", candidato.id);
    }
  } catch (err) {
    console.error("Error avisando a la lista de espera", err);
  }
}

/**
 * Punto único para crear una cita, usado tanto por la reserva desde la
 * app/web como por el futuro asistente de WhatsApp. Vuelve a comprobar
 * disponibilidad justo antes de insertar para evitar dobles reservas si
 * dos personas piden el mismo hueco casi a la vez.
 */
export async function crearReserva(params: CrearReservaParams) {
  const supabase = createAdminClient();

  // Complementos añadidos en el paso extra (opcional): amplían la
  // duración del hueco. Se guardan como filas propias en cita_extras
  // (para que los informes de facturación y servicios más pedidos los
  // cuenten con precisión) y también como texto en "notas" para que se
  // lean de un vistazo en la agenda.
  const complementoIds = (params.complementoIds ?? []).filter(Boolean);
  let duracionExtraMinutos = 0;
  let notaComplementos: string | null = null;
  let complementosParaGuardar: { servicio_id: string; precio_centimos: number; duracion_minutos: number }[] = [];
  if (complementoIds.length > 0) {
    const { data: complementos } = await supabase
      .from("servicios")
      .select("id, nombre, duracion_minutos, precio_centimos")
      .in("id", complementoIds);
    if (complementos && complementos.length > 0) {
      duracionExtraMinutos = complementos.reduce((acc, c) => acc + c.duracion_minutos, 0);
      notaComplementos = "Complementos: " + complementos.map((c) => `${c.nombre} (${(c.precio_centimos / 100).toFixed(2)}€)`).join(", ");
      complementosParaGuardar = complementos.map((c) => ({
        servicio_id: c.id,
        precio_centimos: c.precio_centimos,
        duracion_minutos: c.duracion_minutos,
      }));
    }
  }

  const slots = await getAvailableSlots({
    sedeId: params.sedeId,
    servicioId: params.servicioId,
    fecha: params.fecha,
    profesionalId: params.profesionalId,
    duracionExtraMinutos,
  });

  const slotElegido = slots.find((s) => s.hora_inicio === params.horaInicioISO);
  if (!slotElegido) {
    throw new ReservaError(
      "Ese horario ya no está disponible. Por favor, elige otra hora."
    );
  }

  const { data: servicio } = await supabase
    .from("servicios")
    .select("duracion_minutos, precio_centimos")
    .eq("id", params.servicioId)
    .single();
  const { data: override } = await supabase
    .from("sede_servicios")
    .select("duracion_minutos")
    .eq("sede_id", params.sedeId)
    .eq("servicio_id", params.servicioId)
    .maybeSingle();
  const duracionMinutos = (override?.duracion_minutos ?? servicio?.duracion_minutos ?? 30) + duracionExtraMinutos;

  // Total de la cita (servicio + complementos) — el mismo número que ve
  // el cliente en el paso de confirmación de app/reservar. sede_servicios
  // tiene una columna de precio propia por sede que hoy no se usa en
  // ningún otro sitio de la app (tampoco en los informes de facturación),
  // así que el saldo de fidelización sigue ese mismo criterio para no
  // introducir una fuente de verdad distinta.
  const precioServicioCentimos = servicio?.precio_centimos ?? 0;
  const totalCentimos =
    precioServicioCentimos + complementosParaGuardar.reduce((acc, c) => acc + c.precio_centimos, 0);

  const inicio = new Date(params.horaInicioISO);
  const fin = addMinutes(inicio, duracionMinutos);

  // 1. Encontrar o crear el cliente por teléfono (mismo criterio que usa
  // el registro de cuenta con contraseña y el alta manual desde el
  // panel — ver lib/clientes.ts — para que siempre casen con el mismo
  // historial, venga la reserva de donde venga).
  const { clienteId, esNuevo } = await buscarOCrearCliente(supabase, {
    nombre: params.cliente.nombre,
    telefono: params.cliente.telefono,
    email: params.cliente.email,
    sedeId: params.sedeId,
  });

  if (esNuevo) {
    // Consentimiento operativo: implícito al usar el servicio, se registra
    // igualmente para trazabilidad (ver sección 8 del documento de
    // especificación / RGPD).
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "operativo",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_OPERATIVO,
    });
  }

  if (params.aceptaComercial) {
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "comercial",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_COMERCIAL,
    });
  }

  // Si el cliente quiere pagar con su saldo de fidelización, se comprueba
  // ANTES de crear la cita que le cubre el total exacto — no se admite
  // canje parcial ("descontar" solo una parte no está permitido). Esto
  // evita crear y tener que deshacer la cita en el caso normal; el canje
  // real (más abajo) se vuelve a comprobar en la propia base de datos por
  // si el saldo cambiase justo en medio, por ejemplo por otra reserva
  // simultánea del mismo cliente.
  if (params.pagarConSaldo) {
    const saldoActual = await saldoDelCliente(supabase, clienteId);
    if (saldoActual < totalCentimos) {
      throw new ReservaError("El saldo acumulado no cubre el total de esta cita.");
    }
  }

  // 2. Crear la cita
  const { data: cita, error: errorCita } = await supabase
    .from("citas")
    .insert({
      cliente_id: clienteId,
      sede_id: params.sedeId,
      profesional_id: slotElegido.profesional_id,
      servicio_id: params.servicioId,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      origen: params.origen,
      notas: notaComplementos,
      saldo_canjeado_centimos: params.pagarConSaldo ? totalCentimos : 0,
    })
    .select("*")
    .single();

  if (errorCita || !cita) {
    throw new ReservaError("No se pudo crear la cita. Inténtalo de nuevo.");
  }

  if (complementosParaGuardar.length > 0) {
    await supabase.from("cita_extras").insert(
      complementosParaGuardar.map((c) => ({ cita_id: cita.id, ...c }))
    );
  }

  if (params.pagarConSaldo && totalCentimos > 0) {
    try {
      await canjearSaldoEnCita(supabase, { clienteId, citaId: cita.id, importeCentimos: totalCentimos });
    } catch (err) {
      // El saldo dejó de alcanzar justo entre la comprobación de arriba y
      // este momento (carrera muy poco probable, pero posible). Se
      // deshace la cita recién creada (cita_extras se borra en cascada)
      // en vez de dejarla creada sin haberse cobrado de verdad.
      await supabase.from("citas").delete().eq("id", cita.id);
      if (err instanceof SaldoInsuficienteError) {
        throw new ReservaError("El saldo acumulado no cubre el total de esta cita.");
      }
      throw err;
    }
  }

  // Si este cliente estaba apuntado a la lista de espera para este mismo
  // día, sede y servicio, la reserva ya está hecha: se marca como resuelta
  // en vez de dejarla "pendiente" (o "notificada") para siempre.
  await supabase
    .from("lista_espera")
    .update({ estado: "reservado" })
    .eq("cliente_id", clienteId)
    .eq("sede_id", params.sedeId)
    .eq("servicio_id", params.servicioId)
    .eq("fecha", params.fecha)
    .in("estado", ["pendiente", "notificado"]);

  // Copia la ficha del cliente y la cita nueva a HubSpot (CRM externo de
  // Diego). Estas funciones nunca lanzan: si HubSpot falla o no está
  // configurado, la reserva ya está hecha en Supabase igualmente.
  await sincronizarClienteHubSpot(supabase, clienteId);
  await sincronizarCitaHubSpot(supabase, cita.id);

  return { cita, clienteId, profesionalNombre: slotElegido.profesional_nombre };
}

/**
 * Minutos de antelación mínimos para que el propio cliente pueda cancelar
 * o reprogramar su cita por WhatsApp sin intervención humana (política de
 * Diego: por debajo de este margen, la IA no lo hace sola y pide que
 * llamen a la barbería). El panel de administración no tiene este límite:
 * un gestor humano puede cancelar/mover cualquier cita en cualquier
 * momento desde /admin/dashboard.
 */
export const MINUTOS_MINIMOS_CANCELACION_AUTOMATICA = 60;

export function puedeGestionarseAutomaticamente(inicioISO: string): boolean {
  const minutosHastaLaCita = (new Date(inicioISO).getTime() - Date.now()) / 60000;
  return minutosHastaLaCita >= MINUTOS_MINIMOS_CANCELACION_AUTOMATICA;
}

/**
 * Cancela una cita ya existente. Usado tanto por el asistente de WhatsApp
 * (con el límite de la 1 hora ya comprobado antes de llamar a esto) como,
 * en el futuro, por otros puntos de entrada.
 */
export async function cancelarCita(citaId: string) {
  const supabase = createAdminClient();
  const { data: cita, error } = await supabase
    .from("citas")
    .update({ estado: "cancelada" })
    .eq("id", citaId)
    .select("*")
    .single();
  if (error || !cita) throw new ReservaError("No se pudo cancelar la cita.");
  await sincronizarCitaHubSpot(supabase, cita.id);
  await notificarListaEsperaPorHueco(cita);
  // Si esta cita se había pagado con saldo de fidelización, se le
  // devuelve íntegro al cliente: cancelar no debería costarle el saldo
  // que ya tenía ganado.
  await reembolsarSaldoDeCita(supabase, cita);
  return cita;
}

interface ReprogramarCitaParams {
  citaId: string;
  nuevaHoraInicioISO: string;
  // Si no se indica, se mantiene el mismo profesional/sede/servicio y solo
  // cambia el horario; getAvailableSlots decide igualmente qué profesional
  // atiende si el original no está libre a esa hora.
  profesionalId?: string | null;
}

/**
 * Mueve una cita existente a un nuevo horario, comprobando disponibilidad
 * real igual que al crearla (evita dobles reservas).
 */
export async function reprogramarCita({ citaId, nuevaHoraInicioISO, profesionalId }: ReprogramarCitaParams) {
  const supabase = createAdminClient();
  const { data: citaActual } = await supabase.from("citas").select("*").eq("id", citaId).single();
  if (!citaActual) throw new ReservaError("No se encontró la cita.");

  const duracionMinutos = Math.round(
    (new Date(citaActual.fin).getTime() - new Date(citaActual.inicio).getTime()) / 60000
  );

  const fecha = new Date(nuevaHoraInicioISO).toISOString().slice(0, 10);
  const slots = await getAvailableSlots({
    sedeId: citaActual.sede_id,
    servicioId: citaActual.servicio_id,
    fecha,
    profesionalId: profesionalId ?? citaActual.profesional_id,
    duracionExtraMinutos: 0,
  });

  // La duración total (servicio + complementos) ya está fijada en la cita
  // original; buscamos un hueco de esa misma duración exacta a partir de
  // los slots que ofrece el motor de disponibilidad (que asume la
  // duración base del servicio) comprobando que, extendido, no choca.
  const slotElegido = slots.find((s) => s.hora_inicio === nuevaHoraInicioISO);
  if (!slotElegido) {
    throw new ReservaError("Ese horario ya no está disponible. Elige otra hora.");
  }

  const nuevoInicio = new Date(nuevaHoraInicioISO);
  const nuevoFin = addMinutes(nuevoInicio, duracionMinutos);

  const { data: citaActualizada, error } = await supabase
    .from("citas")
    .update({
      inicio: nuevoInicio.toISOString(),
      fin: nuevoFin.toISOString(),
      profesional_id: slotElegido.profesional_id,
      recordatorio_enviado_at: null, // si ya se había mandado, que se vuelva a mandar para la nueva hora
    })
    .eq("id", citaId)
    .select("*")
    .single();

  if (error || !citaActualizada) throw new ReservaError("No se pudo reprogramar la cita.");
  await sincronizarCitaHubSpot(supabase, citaActualizada.id);
  return { cita: citaActualizada, profesionalNombre: slotElegido.profesional_nombre };
}

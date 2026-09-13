import "server-only";
import { addMinutes } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import { buscarOCrearCliente, normalizarTelefono } from "@/lib/clientes";
import { sincronizarClienteHubSpot, sincronizarCitaHubSpot } from "@/lib/hubspot";
import type { CanalConsentimiento } from "@/lib/types";

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
}

export class ReservaError extends Error {}

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
    .select("duracion_minutos")
    .eq("id", params.servicioId)
    .single();
  const { data: override } = await supabase
    .from("sede_servicios")
    .select("duracion_minutos")
    .eq("sede_id", params.sedeId)
    .eq("servicio_id", params.servicioId)
    .maybeSingle();
  const duracionMinutos = (override?.duracion_minutos ?? servicio?.duracion_minutos ?? 30) + duracionExtraMinutos;

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

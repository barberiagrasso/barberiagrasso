import "server-only";
import { addMinutes } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import type { CanalConsentimiento } from "@/lib/types";

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
  // duración del hueco y se anotan en la cita.
  const complementoIds = (params.complementoIds ?? []).filter(Boolean);
  let duracionExtraMinutos = 0;
  let notaComplementos: string | null = null;
  if (complementoIds.length > 0) {
    const { data: complementos } = await supabase
      .from("servicios")
      .select("nombre, duracion_minutos, precio_centimos")
      .in("id", complementoIds);
    if (complementos && complementos.length > 0) {
      duracionExtraMinutos = complementos.reduce((acc, c) => acc + c.duracion_minutos, 0);
      notaComplementos =
        "Complementos: " +
        complementos
          .map((c) => `${c.nombre.replace(/^Complemento:\s*/, "")} (${(c.precio_centimos / 100).toFixed(2)}€)`)
          .join(", ");
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

  // 1. Encontrar o crear el cliente por teléfono
  const telefono = normalizarTelefono(params.cliente.telefono);
  const { data: clienteExistente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();

  let clienteId = clienteExistente?.id as string | undefined;
  if (!clienteId) {
    const { data: nuevoCliente, error: errorCliente } = await supabase
      .from("clientes")
      .insert({
        nombre: params.cliente.nombre,
        telefono,
        email: params.cliente.email || null,
        sede_habitual_id: params.sedeId,
      })
      .select("id")
      .single();
    if (errorCliente || !nuevoCliente) {
      throw new ReservaError("No se pudo registrar el cliente.");
    }
    clienteId = nuevoCliente.id;

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

  return { cita, clienteId, profesionalNombre: slotElegido.profesional_nombre };
}

/**
 * Normaliza un teléfono a un formato consistente (aprox. E.164) para que
 * el mismo cliente se reconozca tanto si reserva desde la app (puede
 * escribir "612 345 678") como si escribe por WhatsApp (llega como
 * "34612345678", sin "+"). Ajusta el prefijo "34" si en el futuro abres
 * en otro país.
 */
export function normalizarTelefono(telefono: string): string {
  const soloDigitosYMas = telefono.replace(/[^\d+]/g, "");
  if (soloDigitosYMas.startsWith("+")) return soloDigitosYMas;
  if (soloDigitosYMas.length === 9 && /^[679]/.test(soloDigitosYMas)) {
    return `+34${soloDigitosYMas}`;
  }
  return `+${soloDigitosYMas}`;
}

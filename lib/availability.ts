import "server-only";
import { addMinutes, isBefore, parse, startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FranjaDisponible } from "@/lib/types";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";
const SLOT_STEP_MINUTES = 15;
// Margen mínimo de antelación para reservar hoy mismo (evita reservas
// "para dentro de 2 minutos" que nadie llegaría a atender).
const LEAD_TIME_MINUTES = 30;

interface Params {
  sedeId: string;
  servicioId: string;
  fecha: string; // "YYYY-MM-DD" en la zona horaria del negocio
  profesionalId?: string | null;
  // Minutos adicionales de complementos añadidos al servicio principal
  // (ver lib/booking.ts) — se suman a la duración del servicio a la
  // hora de calcular y bloquear el hueco.
  duracionExtraMinutos?: number;
}

/**
 * Calcula los huecos disponibles para reservar un servicio en una sede
 * y fecha concretas, opcionalmente restringido a un profesional.
 * Toda la lógica de solapes se hace en UTC; los horarios de trabajo se
 * interpretan como hora local del negocio (BUSINESS_TIMEZONE).
 */
export async function getAvailableSlots({
  sedeId,
  servicioId,
  fecha,
  profesionalId,
  duracionExtraMinutos,
}: Params): Promise<FranjaDisponible[]> {
  const supabase = createAdminClient();

  // 1. Duración del servicio (puede variar por sede)
  const { data: servicio } = await supabase
    .from("servicios")
    .select("duracion_minutos")
    .eq("id", servicioId)
    .single();
  if (!servicio) return [];

  const { data: override } = await supabase
    .from("sede_servicios")
    .select("duracion_minutos, activo")
    .eq("sede_id", sedeId)
    .eq("servicio_id", servicioId)
    .maybeSingle();

  if (override && override.activo === false) return []; // servicio desactivado en esa sede

  const duracionMinutos =
    (override?.duracion_minutos ?? servicio.duracion_minutos) + (duracionExtraMinutos ?? 0);

  // 2. Profesionales candidatos en esa sede que realizan ese servicio
  let profesionalesQuery = supabase
    .from("profesional_sedes")
    .select("profesional_id, profesionales!inner(id, nombre, activo)")
    .eq("sede_id", sedeId)
    .eq("profesionales.activo", true);
  if (profesionalId) {
    profesionalesQuery = profesionalesQuery.eq("profesional_id", profesionalId);
  }
  const { data: sedeProfesionales } = await profesionalesQuery;
  if (!sedeProfesionales || sedeProfesionales.length === 0) return [];

  const { data: profesionalServicios } = await supabase
    .from("profesional_servicios")
    .select("profesional_id")
    .eq("servicio_id", servicioId);
  const idsQueHacenServicio = new Set((profesionalServicios ?? []).map((p) => p.profesional_id));

  const candidatos = sedeProfesionales
    .filter((sp) => idsQueHacenServicio.has(sp.profesional_id))
    .map((sp) => {
      const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
      return { id: sp.profesional_id, nombre: (prof as { nombre: string })?.nombre ?? "" };
    });
  if (candidatos.length === 0) return [];

  // 3. Rango del día en UTC (para consultar bloqueos y citas de una sola vez)
  const inicioDiaLocal = parse(fecha, "yyyy-MM-dd", new Date());
  const diaSemana = toZonedTime(inicioDiaLocal, TZ).getDay();
  const inicioDiaUTC = fromZonedTime(startOfDay(inicioDiaLocal), TZ);
  const finDiaUTC = fromZonedTime(endOfDay(inicioDiaLocal), TZ);

  const candidatoIds = candidatos.map((c) => c.id);

  const { data: horarios } = await supabase
    .from("horarios")
    .select("profesional_id, hora_inicio, hora_fin")
    .eq("sede_id", sedeId)
    .eq("dia_semana", diaSemana)
    .in("profesional_id", candidatoIds);

  const { data: bloqueos } = await supabase
    .from("bloqueos")
    .select("profesional_id, fecha_inicio, fecha_fin")
    .eq("sede_id", sedeId)
    .lt("fecha_inicio", finDiaUTC.toISOString())
    .gt("fecha_fin", inicioDiaUTC.toISOString());

  const { data: citas } = await supabase
    .from("citas")
    .select("profesional_id, inicio, fin")
    .eq("sede_id", sedeId)
    .neq("estado", "cancelada")
    .lt("inicio", finDiaUTC.toISOString())
    .gt("fin", inicioDiaUTC.toISOString());

  const ahora = new Date();
  const limiteAntelacion = addMinutes(ahora, LEAD_TIME_MINUTES);

  const resultado: FranjaDisponible[] = [];

  for (const candidato of candidatos) {
    const horariosDelDia = (horarios ?? []).filter((h) => h.profesional_id === candidato.id);
    const bloqueosDelProfesional = (bloqueos ?? []).filter(
      (b) => b.profesional_id === candidato.id || b.profesional_id === null
    );
    const citasDelProfesional = (citas ?? []).filter((c) => c.profesional_id === candidato.id);

    for (const turno of horariosDelDia) {
      const turnoInicioLocal = combinarFechaYHora(fecha, turno.hora_inicio);
      const turnoFinLocal = combinarFechaYHora(fecha, turno.hora_fin);
      const turnoInicioUTC = fromZonedTime(turnoInicioLocal, TZ);
      const turnoFinUTC = fromZonedTime(turnoFinLocal, TZ);

      let cursor = turnoInicioUTC;
      while (isBefore(addMinutes(cursor, duracionMinutos), addMinutes(turnoFinUTC, 1))) {
        const slotInicio = cursor;
        const slotFin = addMinutes(cursor, duracionMinutos);

        const solapaBloqueo = bloqueosDelProfesional.some(
          (b) => slotInicio < new Date(b.fecha_fin) && slotFin > new Date(b.fecha_inicio)
        );
        const solapaCita = citasDelProfesional.some(
          (c) => slotInicio < new Date(c.fin) && slotFin > new Date(c.inicio)
        );
        const esFuturo = !isBefore(slotInicio, limiteAntelacion);

        if (!solapaBloqueo && !solapaCita && esFuturo) {
          resultado.push({
            hora_inicio: slotInicio.toISOString(),
            profesional_id: candidato.id,
            profesional_nombre: candidato.nombre,
          });
        }

        cursor = addMinutes(cursor, SLOT_STEP_MINUTES);
      }
    }
  }

  resultado.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  return resultado;
}

function combinarFechaYHora(fecha: string, hora: string): Date {
  // hora viene de Postgres como "HH:mm:ss"
  return parse(`${fecha} ${hora}`, "yyyy-MM-dd HH:mm:ss", new Date());
}

export { TZ as BUSINESS_TIMEZONE };

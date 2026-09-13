import "server-only";
import { addMinutes, isBefore, parse, startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FranjaDisponible, NivelDisponibilidad, ResumenDiaDisponibilidad } from "@/lib/types";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";
const SLOT_STEP_MINUTES = 15;
// Margen mínimo de antelación para reservar hoy mismo (evita reservas
// "para dentro de 2 minutos" que nadie llegaría a atender).
const LEAD_TIME_MINUTES = 30;

// Umbrales (nº de horas distintas con hueco libre ese día, contando
// "cualquiera" como la unión de todo el equipo) que deciden el color de
// la barra de disponibilidad en el calendario. Ajustables si con el uso
// real conviene otro corte.
const UMBRAL_DISPONIBILIDAD_MEDIA = 8;
const UMBRAL_DISPONIBILIDAD_ALTA = 20;

interface CandidatoInfo {
  id: string;
  nombre: string;
}

interface HorarioFila {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
}

interface BloqueoFila {
  profesional_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
}

interface CitaFila {
  profesional_id: string | null;
  inicio: string;
  fin: string;
}

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

  const datosBase = await cargarDatosBase(supabase, sedeId, servicioId, profesionalId, duracionExtraMinutos);
  if (!datosBase) return [];
  const { candidatos, duracionMinutos } = datosBase;
  const candidatoIds = candidatos.map((c) => c.id);

  const fechaLocal = parse(fecha, "yyyy-MM-dd", new Date());
  const diaSemana = toZonedTime(fechaLocal, TZ).getDay();
  const inicioDiaUTC = fromZonedTime(startOfDay(fechaLocal), TZ);
  const finDiaUTC = fromZonedTime(endOfDay(fechaLocal), TZ);

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

  return generarSlotsParaDia({
    fecha,
    candidatos,
    horariosDelDia: horarios ?? [],
    bloqueos: bloqueos ?? [],
    citas: citas ?? [],
    duracionMinutos,
    ahora: new Date(),
  });
}

/**
 * Resumen de disponibilidad de cada día de un mes, para pintar el
 * calendario de reserva (barra verde/amarilla/roja, o día no
 * seleccionable si no hay ningún hueco). Trae los horarios, bloqueos y
 * citas del mes entero de una sola vez y calcula día a día en memoria,
 * en vez de repetir las consultas 28-31 veces.
 */
export async function getMonthAvailabilitySummary({
  sedeId,
  servicioId,
  profesionalId,
  anio,
  mes, // 1-12
  duracionExtraMinutos,
}: {
  sedeId: string;
  servicioId: string;
  profesionalId?: string | null;
  anio: number;
  mes: number;
  duracionExtraMinutos?: number;
}): Promise<ResumenDiaDisponibilidad[]> {
  const supabase = createAdminClient();

  const datosBase = await cargarDatosBase(supabase, sedeId, servicioId, profesionalId, duracionExtraMinutos);
  if (!datosBase) return [];
  const { candidatos, duracionMinutos } = datosBase;
  const candidatoIds = candidatos.map((c) => c.id);

  const totalDias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const primerDiaLocal = parse(`${anio}-${pad(mes)}-01`, "yyyy-MM-dd", new Date());
  const ultimoDiaLocal = parse(`${anio}-${pad(mes)}-${pad(totalDias)}`, "yyyy-MM-dd", new Date());
  const inicioMesUTC = fromZonedTime(startOfDay(primerDiaLocal), TZ);
  const finMesUTC = fromZonedTime(endOfDay(ultimoDiaLocal), TZ);

  const { data: horarios } = await supabase
    .from("horarios")
    .select("profesional_id, dia_semana, hora_inicio, hora_fin")
    .eq("sede_id", sedeId)
    .in("profesional_id", candidatoIds);

  const horariosPorDiaSemana = new Map<number, HorarioFila[]>();
  for (const h of horarios ?? []) {
    if (!horariosPorDiaSemana.has(h.dia_semana)) horariosPorDiaSemana.set(h.dia_semana, []);
    horariosPorDiaSemana.get(h.dia_semana)!.push(h);
  }

  const { data: bloqueos } = await supabase
    .from("bloqueos")
    .select("profesional_id, fecha_inicio, fecha_fin")
    .eq("sede_id", sedeId)
    .lt("fecha_inicio", finMesUTC.toISOString())
    .gt("fecha_fin", inicioMesUTC.toISOString());

  const { data: citas } = await supabase
    .from("citas")
    .select("profesional_id, inicio, fin")
    .eq("sede_id", sedeId)
    .neq("estado", "cancelada")
    .lt("inicio", finMesUTC.toISOString())
    .gt("fin", inicioMesUTC.toISOString());

  const ahora = new Date();
  const resumen: ResumenDiaDisponibilidad[] = [];

  for (let dia = 1; dia <= totalDias; dia++) {
    const fechaStr = `${anio}-${pad(mes)}-${pad(dia)}`;
    const fechaLocal = parse(fechaStr, "yyyy-MM-dd", new Date());
    const diaSemana = toZonedTime(fechaLocal, TZ).getDay();
    const horariosDelDia = horariosPorDiaSemana.get(diaSemana) ?? [];

    if (horariosDelDia.length === 0) {
      // Negocio cerrado ese día de la semana para estos candidatos.
      resumen.push({ fecha: fechaStr, huecos: 0, nivel: "ninguna", seleccionable: false });
      continue;
    }

    const inicioDiaUTC = fromZonedTime(startOfDay(fechaLocal), TZ);
    const finDiaUTC = fromZonedTime(endOfDay(fechaLocal), TZ);
    const bloqueosDelDia = (bloqueos ?? []).filter(
      (b) => new Date(b.fecha_inicio) < finDiaUTC && new Date(b.fecha_fin) > inicioDiaUTC
    );
    const citasDelDia = (citas ?? []).filter(
      (c) => new Date(c.inicio) < finDiaUTC && new Date(c.fin) > inicioDiaUTC
    );

    const slots = generarSlotsParaDia({
      fecha: fechaStr,
      candidatos,
      horariosDelDia,
      bloqueos: bloqueosDelDia,
      citas: citasDelDia,
      duracionMinutos,
      ahora,
    });
    const huecos = new Set(slots.map((s) => s.hora_inicio)).size;

    let nivel: NivelDisponibilidad;
    if (huecos === 0) nivel = "ninguna";
    else if (huecos < UMBRAL_DISPONIBILIDAD_MEDIA) nivel = "baja";
    else if (huecos < UMBRAL_DISPONIBILIDAD_ALTA) nivel = "media";
    else nivel = "alta";

    resumen.push({ fecha: fechaStr, huecos, nivel, seleccionable: huecos > 0 });
  }

  return resumen;
}

// ---------------------------------------------------------------------
// Helpers compartidos
// ---------------------------------------------------------------------

/** Duración real del servicio en esta sede + profesionales candidatos
 * (trabajan en la sede y realizan el servicio). Devuelve null si el
 * servicio está desactivado en esa sede o si no hay ningún candidato. */
async function cargarDatosBase(
  supabase: ReturnType<typeof createAdminClient>,
  sedeId: string,
  servicioId: string,
  profesionalId?: string | null,
  duracionExtraMinutos?: number
): Promise<{ candidatos: CandidatoInfo[]; duracionMinutos: number } | null> {
  const { data: servicio } = await supabase
    .from("servicios")
    .select("duracion_minutos")
    .eq("id", servicioId)
    .single();
  if (!servicio) return null;

  const { data: override } = await supabase
    .from("sede_servicios")
    .select("duracion_minutos, activo")
    .eq("sede_id", sedeId)
    .eq("servicio_id", servicioId)
    .maybeSingle();

  if (override && override.activo === false) return null; // servicio desactivado en esa sede

  let profesionalesQuery = supabase
    .from("profesional_sedes")
    .select("profesional_id, profesionales!inner(id, nombre, activo)")
    .eq("sede_id", sedeId)
    .eq("profesionales.activo", true);
  if (profesionalId) {
    profesionalesQuery = profesionalesQuery.eq("profesional_id", profesionalId);
  }
  const { data: sedeProfesionales } = await profesionalesQuery;
  if (!sedeProfesionales || sedeProfesionales.length === 0) return null;

  const { data: profesionalServicios } = await supabase
    .from("profesional_servicios")
    .select("profesional_id")
    .eq("servicio_id", servicioId);
  const idsQueHacenServicio = new Set((profesionalServicios ?? []).map((p) => p.profesional_id));

  const candidatos = sedeProfesionales
    .filter((sp) => idsQueHacenServicio.has(sp.profesional_id))
    .map((sp) => {
      const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
      return { id: sp.profesional_id as string, nombre: (prof as { nombre: string })?.nombre ?? "" };
    });
  if (candidatos.length === 0) return null;

  return {
    candidatos,
    duracionMinutos: (override?.duracion_minutos ?? servicio.duracion_minutos) + (duracionExtraMinutos ?? 0),
  };
}

/** Genera las franjas libres de un día concreto a partir de datos ya
 * cargados (nada de red aquí), para poder reutilizarlo tanto en el
 * cálculo de un solo día como en el resumen de un mes entero. Exportada
 * (además de por getAvailableSlots/getMonthAvailabilitySummary) para
 * poder probar a fondo la lógica de huecos/solapes/antelación en
 * availability.test.ts sin necesitar una base de datos real. */
export function generarSlotsParaDia({
  fecha,
  candidatos,
  horariosDelDia,
  bloqueos,
  citas,
  duracionMinutos,
  ahora,
}: {
  fecha: string;
  candidatos: CandidatoInfo[];
  horariosDelDia: HorarioFila[];
  bloqueos: BloqueoFila[];
  citas: CitaFila[];
  duracionMinutos: number;
  ahora: Date;
}): FranjaDisponible[] {
  const limiteAntelacion = addMinutes(ahora, LEAD_TIME_MINUTES);
  const resultado: FranjaDisponible[] = [];

  for (const candidato of candidatos) {
    const horariosCandidato = horariosDelDia.filter((h) => h.profesional_id === candidato.id);
    const bloqueosDelProfesional = bloqueos.filter(
      (b) => b.profesional_id === candidato.id || b.profesional_id === null
    );
    const citasDelProfesional = citas.filter((c) => c.profesional_id === candidato.id);

    for (const turno of horariosCandidato) {
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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export { TZ as BUSINESS_TIMEZONE };

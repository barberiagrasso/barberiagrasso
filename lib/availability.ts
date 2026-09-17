import "server-only";
import { addMinutes, isBefore, parse, startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FranjaDisponible, NivelDisponibilidad, ResumenDiaDisponibilidad } from "@/lib/types";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";
// Paso base de los huecos ofrecidos cuando la agenda está libre (decisión
// de Diego, 17/09/2026): 09:30, 10:00, 10:30... Cuando un servicio dura
// más de 30 minutos, el siguiente hueco se ofrece justo al terminar ese
// servicio (no en el siguiente múltiplo de 30 desde el inicio del turno)
// y, a partir de ahí, vuelve a avanzar de 30 en 30 — ver
// generarSlotsParaDia más abajo, que es quien de verdad implementa esto.
const SLOT_STEP_MINUTES = 30;
// Margen mínimo de antelación para reservar hoy mismo (evita reservas
// "para dentro de 2 minutos" que nadie llegaría a atender).
const LEAD_TIME_MINUTES = 30;

// Umbrales (nº de horas distintas con hueco libre ese día, contando
// "cualquiera" como la unión de todo el equipo) que deciden el color de
// la barra de disponibilidad en el calendario. La mitad que antes: con
// el paso base a 30 minutos (antes 15), un día abierto normal genera la
// mitad de huecos distintos que antes para la misma disponibilidad real.
const UMBRAL_DISPONIBILIDAD_MEDIA = 4;
const UMBRAL_DISPONIBILIDAD_ALTA = 10;

interface CandidatoInfo {
  id: string;
  nombre: string;
}

interface HorarioFila {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
}

interface DescansoFila {
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
    .select("profesional_id, hora_inicio, hora_fin, descanso_inicio, descanso_fin")
    .eq("sede_id", sedeId)
    .eq("dia_semana", diaSemana)
    .in("profesional_id", candidatoIds);

  const { data: excepciones } = await supabase
    .from("descansos_excepciones")
    .select("profesional_id, hora_inicio, hora_fin")
    .eq("fecha", fecha)
    .in("profesional_id", candidatoIds);

  const { data: bloqueos } = await supabase
    .from("bloqueos")
    .select("profesional_id, fecha_inicio, fecha_fin")
    .eq("sede_id", sedeId)
    .lt("fecha_inicio", finDiaUTC.toISOString())
    .gt("fecha_fin", inicioDiaUTC.toISOString());

  const { data: vacaciones } = await supabase
    .from("solicitudes_vacaciones")
    .select("profesional_id, fecha_inicio, fecha_fin")
    .eq("estado", "aprobada")
    .in("profesional_id", candidatoIds)
    .lte("fecha_inicio", fecha)
    .gte("fecha_fin", fecha);

  const { data: citas } = await supabase
    .from("citas")
    .select("profesional_id, inicio, fin")
    .eq("sede_id", sedeId)
    .neq("estado", "cancelada")
    .lt("inicio", finDiaUTC.toISOString())
    .gt("fin", inicioDiaUTC.toISOString());

  const bloqueosDelDia = [
    ...(bloqueos ?? []),
    ...vacacionesComoBloqueos(vacaciones ?? [], inicioDiaUTC, finDiaUTC),
  ];

  return generarSlotsParaDia({
    fecha,
    candidatos,
    horariosDelDia: horarios ?? [],
    descansosDelDia: resolverDescansos(horarios ?? [], excepciones ?? []),
    bloqueos: bloqueosDelDia,
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
  const primerDiaStr = `${anio}-${pad(mes)}-01`;
  const ultimoDiaStr = `${anio}-${pad(mes)}-${pad(totalDias)}`;

  const { data: horarios } = await supabase
    .from("horarios")
    .select("profesional_id, dia_semana, hora_inicio, hora_fin, descanso_inicio, descanso_fin")
    .eq("sede_id", sedeId)
    .in("profesional_id", candidatoIds);

  const horariosPorDiaSemana = new Map<number, (HorarioFila & { descanso_inicio: string | null; descanso_fin: string | null })[]>();
  for (const h of horarios ?? []) {
    if (!horariosPorDiaSemana.has(h.dia_semana)) horariosPorDiaSemana.set(h.dia_semana, []);
    horariosPorDiaSemana.get(h.dia_semana)!.push(h);
  }

  const { data: excepciones } = await supabase
    .from("descansos_excepciones")
    .select("profesional_id, fecha, hora_inicio, hora_fin")
    .in("profesional_id", candidatoIds)
    .gte("fecha", primerDiaStr)
    .lte("fecha", ultimoDiaStr);
  const excepcionesPorFecha = new Map<string, DescansoFila[]>();
  for (const e of excepciones ?? []) {
    if (!excepcionesPorFecha.has(e.fecha)) excepcionesPorFecha.set(e.fecha, []);
    excepcionesPorFecha.get(e.fecha)!.push(e);
  }

  const { data: bloqueos } = await supabase
    .from("bloqueos")
    .select("profesional_id, fecha_inicio, fecha_fin")
    .eq("sede_id", sedeId)
    .lt("fecha_inicio", finMesUTC.toISOString())
    .gt("fecha_fin", inicioMesUTC.toISOString());

  const { data: vacaciones } = await supabase
    .from("solicitudes_vacaciones")
    .select("profesional_id, fecha_inicio, fecha_fin")
    .eq("estado", "aprobada")
    .in("profesional_id", candidatoIds)
    .lte("fecha_inicio", ultimoDiaStr)
    .gte("fecha_fin", primerDiaStr);

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
    const vacacionesDelDia = (vacaciones ?? []).filter((v) => v.fecha_inicio <= fechaStr && v.fecha_fin >= fechaStr);
    const citasDelDia = (citas ?? []).filter(
      (c) => new Date(c.inicio) < finDiaUTC && new Date(c.fin) > inicioDiaUTC
    );

    const slots = generarSlotsParaDia({
      fecha: fechaStr,
      candidatos,
      horariosDelDia,
      descansosDelDia: resolverDescansos(horariosDelDia, excepcionesPorFecha.get(fechaStr) ?? []),
      bloqueos: [...bloqueosDelDia, ...vacacionesComoBloqueos(vacacionesDelDia, inicioDiaUTC, finDiaUTC)],
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

/**
 * Botón "Próximos espacios" del paso de fecha de app/reservar: cuando un
 * día elegido no tiene huecos, busca el primer día POSTERIOR con al
 * menos un hueco (con el profesional pedido, o con cualquiera si no se
 * eligió ninguno) y devuelve ya sus huecos, para llevar al cliente
 * directo ahí sin que tenga que ir probando día a día. Reutiliza el
 * resumen mensual (barato) para encontrar el día y solo calcula los
 * huecos en detalle una vez, sobre ese día ya encontrado. Devuelve null
 * si no hay ningún hueco en los próximos `maxMeses` meses.
 */
export async function buscarProximoDiaConHueco({
  sedeId,
  servicioId,
  profesionalId,
  desde,
  duracionExtraMinutos,
  maxMeses = 3,
}: {
  sedeId: string;
  servicioId: string;
  profesionalId?: string | null;
  desde: string; // "YYYY-MM-DD" — se busca a partir del día siguiente a este
  duracionExtraMinutos?: number;
  maxMeses?: number;
}): Promise<{ fecha: string; slots: FranjaDisponible[] } | null> {
  let [anio, mes] = desde.split("-").map(Number);

  for (let i = 0; i <= maxMeses; i++) {
    const resumen = await getMonthAvailabilitySummary({ sedeId, servicioId, profesionalId, anio, mes, duracionExtraMinutos });
    const diaEncontrado = resumen.find((d) => d.fecha > desde && d.seleccionable);
    if (diaEncontrado) {
      const slots = await getAvailableSlots({ sedeId, servicioId, fecha: diaEncontrado.fecha, profesionalId, duracionExtraMinutos });
      // Por si el hueco desaparece justo entre el resumen y el detalle
      // (alguien lo acaba de reservar): seguimos buscando en vez de
      // devolver un día sin huecos de verdad.
      if (slots.length > 0) return { fecha: diaEncontrado.fecha, slots };
    }
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return null;
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

/** Convierte solicitudes de vacaciones aprobadas (rango de fechas) en
 * objetos con la misma forma que un bloqueo (rango de instantes UTC que
 * cubre el día entero), para poder tratarlas exactamente igual a partir
 * de ahí — un barbero de vacaciones no tiene ningún hueco libre ese
 * día, en ninguna sede. */
export function vacacionesComoBloqueos(
  vacaciones: { profesional_id: string; fecha_inicio: string; fecha_fin: string }[],
  inicioDiaUTC: Date,
  finDiaUTC: Date
): BloqueoFila[] {
  return vacaciones.map((v) => ({
    profesional_id: v.profesional_id,
    fecha_inicio: inicioDiaUTC.toISOString(),
    fecha_fin: finDiaUTC.toISOString(),
  }));
}

/** El descanso "efectivo" de cada profesional ese día concreto: si hay
 * una excepción puntual para esa fecha (el admin lo movió arrastrando en
 * la Agenda), manda sobre la regla general; si no, se usa la regla
 * general de ese día de la semana (horarios.descanso_inicio/fin); si no
 * hay ninguna de las dos, ese profesional no tiene descanso ese día. */
export function resolverDescansos(
  horariosDelDia: { profesional_id: string; descanso_inicio?: string | null; descanso_fin?: string | null }[],
  excepcionesDelDia: DescansoFila[]
): DescansoFila[] {
  const excepcionPorProfesional = new Map(excepcionesDelDia.map((e) => [e.profesional_id, e]));
  const resultado: DescansoFila[] = [];
  const yaResueltos = new Set<string>();

  for (const h of horariosDelDia) {
    if (yaResueltos.has(h.profesional_id)) continue;
    yaResueltos.add(h.profesional_id);
    const excepcion = excepcionPorProfesional.get(h.profesional_id);
    if (excepcion) {
      resultado.push(excepcion);
    } else if (h.descanso_inicio && h.descanso_fin) {
      resultado.push({ profesional_id: h.profesional_id, hora_inicio: h.descanso_inicio, hora_fin: h.descanso_fin });
    }
  }
  return resultado;
}

/** Genera las franjas libres de un día concreto a partir de datos ya
 * cargados (nada de red aquí), para poder reutilizarlo tanto en el
 * cálculo de un solo día como en el resumen de un mes entero. Exportada
 * (además de por getAvailableSlots/getMonthAvailabilitySummary) para
 * poder probar a fondo la lógica de huecos/solapes/antelación en
 * availability.test.ts sin necesitar una base de datos real.
 *
 * Algoritmo (decisión de Diego, 17/09/2026): dentro de cada turno se
 * calculan primero los huecos libres reales (turno menos bloqueos, citas
 * y descanso, ya fusionados si se solapan entre sí). Dentro de cada
 * hueco, el primer horario ofrecido es el propio inicio del hueco — que
 * es o bien el inicio del turno, o bien el instante exacto en que
 * termina el obstáculo anterior (una cita, un bloqueo o el descanso) —
 * y a partir de ahí se avanza de 30 en 30 minutos mientras la duración
 * pedida siga cabiendo antes del siguiente obstáculo. Así, una cita de
 * 40 minutos que empieza a las 9:30 dejaría el siguiente hueco
 * exactamente a las 10:10, y desde ahí los huecos vuelven a ir de 30 en
 * 30 (10:10, 10:40, 11:10...) — nunca "vuelve" a la cuadrícula original
 * de 9:30/10:00/10:30. */
export function generarSlotsParaDia({
  fecha,
  candidatos,
  horariosDelDia,
  descansosDelDia = [],
  bloqueos,
  citas,
  duracionMinutos,
  ahora,
}: {
  fecha: string;
  candidatos: CandidatoInfo[];
  horariosDelDia: HorarioFila[];
  descansosDelDia?: DescansoFila[];
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
    const descansoDelProfesional = descansosDelDia.filter((d) => d.profesional_id === candidato.id);

    for (const turno of horariosCandidato) {
      const turnoInicioUTC = fromZonedTime(combinarFechaYHora(fecha, turno.hora_inicio), TZ);
      const turnoFinUTC = fromZonedTime(combinarFechaYHora(fecha, turno.hora_fin), TZ);

      const obstaculos = [
        ...bloqueosDelProfesional.map((b) => ({ inicio: new Date(b.fecha_inicio), fin: new Date(b.fecha_fin) })),
        ...citasDelProfesional.map((c) => ({ inicio: new Date(c.inicio), fin: new Date(c.fin) })),
        ...descansoDelProfesional.map((d) => ({
          inicio: fromZonedTime(combinarFechaYHora(fecha, d.hora_inicio), TZ),
          fin: fromZonedTime(combinarFechaYHora(fecha, d.hora_fin), TZ),
        })),
      ]
        .map((o) => ({
          inicio: o.inicio < turnoInicioUTC ? turnoInicioUTC : o.inicio,
          fin: o.fin > turnoFinUTC ? turnoFinUTC : o.fin,
        }))
        .filter((o) => o.fin > o.inicio)
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

      // Fusiona obstáculos que se solapan o se tocan entre sí, para que
      // los huecos que salgan entre ellos sean siempre reales.
      const fusionados: { inicio: Date; fin: Date }[] = [];
      for (const o of obstaculos) {
        const ultimo = fusionados[fusionados.length - 1];
        if (ultimo && o.inicio <= ultimo.fin) {
          if (o.fin > ultimo.fin) ultimo.fin = o.fin;
        } else {
          fusionados.push({ inicio: o.inicio, fin: o.fin });
        }
      }

      // Huecos libres del turno: desde su inicio (o el fin del obstáculo
      // anterior) hasta el siguiente obstáculo (o el fin del turno).
      const huecos: { inicio: Date; fin: Date }[] = [];
      let cursorLibre = turnoInicioUTC;
      for (const o of fusionados) {
        if (o.inicio > cursorLibre) huecos.push({ inicio: cursorLibre, fin: o.inicio });
        if (o.fin > cursorLibre) cursorLibre = o.fin;
      }
      if (cursorLibre < turnoFinUTC) huecos.push({ inicio: cursorLibre, fin: turnoFinUTC });

      for (const hueco of huecos) {
        let cursor = hueco.inicio;
        while (isBefore(addMinutes(cursor, duracionMinutos), addMinutes(hueco.fin, 1))) {
          const slotInicio = cursor;
          const esFuturo = !isBefore(slotInicio, limiteAntelacion);
          if (esFuturo) {
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

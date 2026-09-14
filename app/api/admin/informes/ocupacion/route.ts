import { NextRequest, NextResponse } from "next/server";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango, TZ } from "@/lib/informes";

export const dynamic = "force-dynamic";

// ~4 meses: por encima de esto el bucle día a día se vuelve caro y no
// aporta demasiado (la ocupación por hora/barbero/día de la semana ya se
// entiende bien con un trimestre de datos).
const MAX_DIAS_OCUPACION = 120;

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

interface HorarioFila {
  profesional_id: string;
  sede_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  profesional: { nombre: string } | { nombre: string }[] | null;
}
interface BloqueoFila {
  profesional_id: string | null;
  sede_id: string;
  fecha_inicio: string;
  fecha_fin: string;
}
interface CitaFila {
  profesional_id: string | null;
  inicio: string;
  estado: string;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function pct(ocupadas: number, capacidad: number): number {
  return capacidad > 0 ? Math.round((ocupadas / capacidad) * 100) : 0;
}

/**
 * Ocupación y capacidad: % global, y desglosada por franja horaria, por
 * barbero y por día de la semana. Es una estimación a partir del horario
 * semanal configurado y los bloqueos (vacaciones/bajas), igual que hacía
 * el informe anterior — solo que ahora también se puede pedir "todas las
 * sedes" y se desglosa en más dimensiones.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");
  if (!desdeStr || !hastaStr) {
    return NextResponse.json({ error: "Faltan desde y hasta." }, { status: 400 });
  }

  const rango = parseRango(desdeStr, hastaStr);
  if (rango.totalDias > MAX_DIAS_OCUPACION) {
    return NextResponse.json({
      ocupacionLimitada: true,
      ocupacionGlobalPct: 0,
      ocupacionPorHora: [],
      ocupacionPorBarbero: [],
      ocupacionPorDiaSemana: [],
    });
  }

  const supabase = createAdminClient();
  const filtrarSede = sedeId && sedeId !== "todas";

  let horariosQuery = supabase.from("horarios").select("profesional_id, sede_id, dia_semana, hora_inicio, hora_fin, profesional:profesionales(nombre)");
  if (filtrarSede) horariosQuery = horariosQuery.eq("sede_id", sedeId);
  const { data: horariosCrudos } = await horariosQuery;
  const horarios = (horariosCrudos ?? []) as unknown as HorarioFila[];

  let bloqueosQuery = supabase
    .from("bloqueos")
    .select("profesional_id, sede_id, fecha_inicio, fecha_fin")
    .lt("fecha_inicio", rango.hastaUTC.toISOString())
    .gt("fecha_fin", rango.desdeUTC.toISOString());
  if (filtrarSede) bloqueosQuery = bloqueosQuery.eq("sede_id", sedeId);
  const { data: bloqueosCrudos } = await bloqueosQuery;
  const bloqueos = (bloqueosCrudos ?? []) as unknown as BloqueoFila[];

  let citasQuery = supabase
    .from("citas")
    .select("profesional_id, inicio, estado")
    .neq("estado", "cancelada")
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString());
  if (filtrarSede) citasQuery = citasQuery.eq("sede_id", sedeId);
  const { data: citasCrudas } = await citasQuery;
  const citas = (citasCrudas ?? []) as unknown as CitaFila[];

  // --- Capacidad: recorre cada día del rango y suma, hora a hora, cuántos
  // barberos tenían hueco abierto (según su horario semanal) y no estaban
  // de baja/vacaciones ese día ---
  const capacidadPorHora = new Map<number, number>();
  const capacidadPorBarbero = new Map<string, { nombre: string; capacidad: number }>();
  const capacidadPorDiaSemana = new Map<number, number>();

  for (let i = 0; i < rango.totalDias; i++) {
    const dia = addDays(rango.inicioLocal, i);
    const diaSemana = toZonedTime(dia, TZ).getDay();
    const inicioDiaUTC = fromZonedTime(startOfDay(dia), TZ);
    const finDiaUTC = fromZonedTime(endOfDay(dia), TZ);
    const horariosDelDia = horarios.filter((h) => h.dia_semana === diaSemana);

    for (const h of horariosDelDia) {
      const bloqueado = bloqueos.some(
        (b) =>
          (b.profesional_id === h.profesional_id || b.profesional_id === null) &&
          (!filtrarSede ? b.sede_id === h.sede_id : true) &&
          new Date(b.fecha_inicio) < finDiaUTC &&
          new Date(b.fecha_fin) > inicioDiaUTC
      );
      if (bloqueado) continue;

      const horaInicio = parseInt(h.hora_inicio.slice(0, 2), 10);
      const horaFinNum = parseInt(h.hora_fin.slice(0, 2), 10);
      const horasDelTurno = Math.max(0, horaFinNum - horaInicio);

      for (let hora = horaInicio; hora < horaFinNum; hora++) {
        capacidadPorHora.set(hora, (capacidadPorHora.get(hora) ?? 0) + 1);
      }
      capacidadPorDiaSemana.set(diaSemana, (capacidadPorDiaSemana.get(diaSemana) ?? 0) + horasDelTurno);

      const profesional = uno(h.profesional);
      const actual = capacidadPorBarbero.get(h.profesional_id) ?? { nombre: profesional?.nombre ?? "Barbero", capacidad: 0 };
      actual.capacidad += horasDelTurno;
      capacidadPorBarbero.set(h.profesional_id, actual);
    }
  }

  // --- Ocupadas: cada cita activa cuenta una hora, en su franja/barbero/día ---
  const ocupadasPorHora = new Map<number, number>();
  const ocupadasPorBarbero = new Map<string, number>();
  const ocupadasPorDiaSemana = new Map<number, number>();
  for (const c of citas) {
    const local = toZonedTime(new Date(c.inicio), TZ);
    const hora = local.getHours();
    const diaSemana = local.getDay();
    ocupadasPorHora.set(hora, (ocupadasPorHora.get(hora) ?? 0) + 1);
    ocupadasPorDiaSemana.set(diaSemana, (ocupadasPorDiaSemana.get(diaSemana) ?? 0) + 1);
    if (c.profesional_id) ocupadasPorBarbero.set(c.profesional_id, (ocupadasPorBarbero.get(c.profesional_id) ?? 0) + 1);
  }

  const horasVistas = new Set([...capacidadPorHora.keys(), ...ocupadasPorHora.keys()]);
  const ocupacionPorHora = Array.from(horasVistas)
    .sort((a, b) => a - b)
    .map((hora) => {
      const ocupadas = ocupadasPorHora.get(hora) ?? 0;
      const capacidad = capacidadPorHora.get(hora) ?? 0;
      return { hora, ocupadas, capacidad, pct: pct(ocupadas, capacidad) };
    });

  const ocupacionPorBarbero = Array.from(capacidadPorBarbero.entries())
    .map(([id, info]) => {
      const ocupadas = ocupadasPorBarbero.get(id) ?? 0;
      return { nombre: info.nombre, ocupadas, capacidad: info.capacidad, pct: pct(ocupadas, info.capacidad) };
    })
    .sort((a, b) => b.pct - a.pct);

  const ocupacionPorDiaSemana = [1, 2, 3, 4, 5, 6, 0].map((diaSemana) => {
    const ocupadas = ocupadasPorDiaSemana.get(diaSemana) ?? 0;
    const capacidad = capacidadPorDiaSemana.get(diaSemana) ?? 0;
    return { nombre: NOMBRES_DIA[diaSemana], ocupadas, capacidad, pct: pct(ocupadas, capacidad) };
  });

  const capacidadGlobal = Array.from(capacidadPorHora.values()).reduce((acc, v) => acc + v, 0);
  const ocupadasGlobal = citas.length;

  return NextResponse.json({
    ocupacionLimitada: false,
    ocupacionGlobalPct: pct(ocupadasGlobal, capacidadGlobal),
    ocupacionPorHora,
    ocupacionPorBarbero,
    ocupacionPorDiaSemana,
  });
}

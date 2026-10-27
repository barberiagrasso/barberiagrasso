import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaEnMadrid, minutosDeHora, minutosEnMadrid } from "@/lib/horarioLocal";
import { ingresoCitaCentimos, type BonoParaComision, type CitaParaFacturacion } from "@/lib/facturacionCita";
import {
  analizarRendimiento,
  diaSemanaDe,
  fechasEntre,
  type AusenciaDia,
  type CitaRendimiento,
  type ExcepcionDescanso,
  type TurnoSemanal,
} from "@/lib/rendimiento";

export const dynamic = "force-dynamic";

// GRASSO PERFORMANCE IA: rendimiento y ocupación de cada barbero en las
// últimas semanas, para el análisis y el simulador de horarios.
// SOLO LECTURA: no crea tablas ni cambia horarios. Solo el dueño (rol admin).

type Supa = ReturnType<typeof createAdminClient>;

// Supabase devuelve como mucho 1000 filas por consulta: se pide por páginas.
async function todasLasFilas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

// Listas largas de ids en trozos, para no pasarse de longitud de URL.
async function porTrozos<T>(ids: string[], pedir: (trozo: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await pedir(ids.slice(i, i + 150));
    filas.push(...(data ?? []));
  }
  return filas;
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

interface CitaFila extends CitaParaFacturacion {
  profesional_id: string;
  sede_id: string;
  cliente_id: string;
  inicio: string;
  fin: string;
}

async function cargarCitas(supabase: Supa, desde: string, hasta: string): Promise<CitaRendimiento[]> {
  const desdeISO = new Date(`${sumarDias(desde, -1)}T22:00:00Z`).toISOString();
  const hastaISO = new Date(`${sumarDias(hasta, 1)}T02:00:00Z`).toISOString();
  const crudas = await todasLasFilas<CitaFila>((a, b) =>
    supabase
      .from("citas")
      .select("id, profesional_id, sede_id, cliente_id, inicio, fin, saldo_canjeado_centimos, precio_final_centimos, bono_id, descuento_porcentaje, grassocoins_canjeados, servicio:servicios(precio_centimos)")
      .eq("estado", "completada")
      .is("recibo_anulado_at", null)
      .not("profesional_id", "is", null)
      .gte("inicio", desdeISO)
      .lt("inicio", hastaISO)
      .order("inicio")
      .range(a, b) as unknown as PromiseLike<{ data: CitaFila[] | null; error: unknown }>,
  );
  const citas = crudas.filter((c) => {
    const f = fechaEnMadrid(c.inicio);
    return f >= desde && f <= hasta;
  });

  const ids = citas.map((c) => c.id);
  const extras = await porTrozos<{ cita_id: string; precio_centimos: number }>(ids, (t) =>
    supabase.from("cita_extras").select("cita_id, precio_centimos").in("cita_id", t),
  );
  const extrasPorCita = new Map<string, number>();
  for (const e of extras) extrasPorCita.set(e.cita_id, (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos);

  const idsBonos = [...new Set(citas.map((c) => c.bono_id).filter((id): id is string => Boolean(id)))];
  const bonos = await porTrozos<{ id: string; precio_pagado_centimos: number; usos_totales: number }>(idsBonos, (t) =>
    supabase.from("bonos").select("id, precio_pagado_centimos, usos_totales").in("id", t),
  );
  const bonosPorId = new Map<string, BonoParaComision>(bonos.map((b) => [b.id, b]));

  return citas.map((c) => {
    const fecha = fechaEnMadrid(c.inicio);
    const inicioMin = minutosEnMadrid(c.inicio);
    const finMin = fechaEnMadrid(c.fin) === fecha ? minutosEnMadrid(c.fin) : 1440;
    return {
      profesionalId: c.profesional_id,
      sedeId: c.sede_id,
      clienteId: c.cliente_id,
      fecha,
      diaSemana: diaSemanaDe(fecha),
      inicioMin,
      finMin: Math.max(finMin, inicioMin + 1),
      ingresoCentimos: ingresoCitaCentimos(c, extrasPorCita, bonosPorId),
    };
  });
}

// Bloqueos (ausencias y cierres, con hora) partidos por día de Madrid.
function partirPorDias(inicioISO: string, finISO: string, desde: string, hasta: string) {
  const fi = fechaEnMadrid(inicioISO);
  const ff = fechaEnMadrid(finISO);
  const dias: { fecha: string; inicioMin: number; finMin: number }[] = [];
  for (const fecha of fechasEntre(fi < desde ? desde : fi, ff > hasta ? hasta : ff)) {
    const inicioMin = fecha === fi ? minutosEnMadrid(inicioISO) : 0;
    const finMin = fecha === ff ? minutosEnMadrid(finISO) : 1440;
    if (finMin > inicioMin) dias.push({ fecha, inicioMin, finMin });
  }
  return dias;
}

export async function GET(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const semanas = Math.min(8, Math.max(4, Number(request.nextUrl.searchParams.get("semanas")) || 6));
  const hasta = sumarDias(fechaEnMadrid(new Date().toISOString()), -1); // hasta ayer, día completo
  const desde = sumarDias(hasta, -(semanas * 7) + 1);
  const supabase = createAdminClient();

  try {
    const [{ data: barberos }, { data: sedes }, { data: horarios }, { data: excepciones }, { data: bloqueos }, { data: vacaciones }, citas] =
      await Promise.all([
        supabase.from("profesionales").select("id, nombre").eq("activo", true).order("nombre"),
        supabase.from("sedes").select("id, nombre").order("nombre"),
        supabase.from("horarios").select("profesional_id, sede_id, dia_semana, hora_inicio, hora_fin, descanso_inicio, descanso_fin"),
        supabase.from("descansos_excepciones").select("profesional_id, fecha, hora_inicio, hora_fin").gte("fecha", desde).lte("fecha", hasta),
        supabase
          .from("bloqueos")
          .select("profesional_id, sede_id, fecha_inicio, fecha_fin")
          .lt("fecha_inicio", `${sumarDias(hasta, 1)}T23:59:59Z`)
          .gt("fecha_fin", `${sumarDias(desde, -1)}T00:00:00Z`),
        supabase
          .from("solicitudes_vacaciones")
          .select("profesional_id, fecha_inicio, fecha_fin")
          .eq("estado", "aprobada")
          .lte("fecha_inicio", hasta)
          .gte("fecha_fin", desde),
        cargarCitas(supabase, desde, hasta),
      ]);

    const turnos: TurnoSemanal[] = (horarios ?? []).map((h) => ({
      profesionalId: h.profesional_id,
      sedeId: h.sede_id,
      diaSemana: h.dia_semana,
      inicioMin: minutosDeHora(h.hora_inicio),
      finMin: minutosDeHora(h.hora_fin),
      descansoInicioMin: h.descanso_inicio ? minutosDeHora(h.descanso_inicio) : null,
      descansoFinMin: h.descanso_fin ? minutosDeHora(h.descanso_fin) : null,
    }));

    const excepcionesDescanso: ExcepcionDescanso[] = (excepciones ?? []).map((e) => ({
      profesionalId: e.profesional_id,
      fecha: e.fecha,
      inicioMin: minutosDeHora(e.hora_inicio),
      finMin: minutosDeHora(e.hora_fin),
    }));

    const ausencias: AusenciaDia[] = [];
    for (const b of bloqueos ?? []) {
      for (const d of partirPorDias(b.fecha_inicio, b.fecha_fin, desde, hasta)) {
        ausencias.push({ profesionalId: b.profesional_id, sedeId: b.sede_id, ...d });
      }
    }
    for (const v of vacaciones ?? []) {
      for (const fecha of fechasEntre(v.fecha_inicio < desde ? desde : v.fecha_inicio, v.fecha_fin > hasta ? hasta : v.fecha_fin)) {
        ausencias.push({ profesionalId: v.profesional_id, sedeId: null, fecha, inicioMin: 0, finMin: 1440 });
      }
    }

    const analisis = analizarRendimiento({
      desde,
      hasta,
      barberos: barberos ?? [],
      sedes: sedes ?? [],
      turnos,
      excepciones: excepcionesDescanso,
      ausencias,
      citas,
    });
    return NextResponse.json(analisis);
  } catch (err) {
    console.error("Rendimiento: error al cargar los datos", err);
    return NextResponse.json({ error: "No se pudieron cargar los datos de rendimiento." }, { status: 500 });
  }
}

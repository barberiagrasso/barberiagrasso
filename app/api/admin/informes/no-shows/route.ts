import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango, granularidadParaRango, bucketDe, generarBuckets } from "@/lib/informes";

export const dynamic = "force-dynamic";

interface CitaFila {
  id: string;
  estado: string;
  origen: string;
  profesional_id: string | null;
  inicio: string;
  profesional: { nombre: string } | { nombre: string }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function pct(parte: number, base: number): number {
  return base > 0 ? Math.round((parte / base) * 1000) / 10 : 0;
}

/**
 * No presentados y cancelaciones: % de cada uno, ingresos perdidos
 * estimados, desglose por barbero/servicio/canal y tendencia en el
 * tiempo — para detectar patrones (¿cancela más quien reserva por
 * WhatsApp? ¿un barbero concreto tiene más no-shows?).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
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
  const supabase = createAdminClient();

  let query = supabase
    .from("citas")
    .select("id, estado, origen, profesional_id, inicio, profesional:profesionales(nombre), servicio:servicios(nombre, precio_centimos)")
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString());
  if (sedeId && sedeId !== "todas") query = query.eq("sede_id", sedeId);
  const { data: citasCrudas } = await query;
  const citas = (citasCrudas ?? []) as unknown as CitaFila[];

  const noPresentadas = citas.filter((c) => c.estado === "no_presentada");
  const canceladas = citas.filter((c) => c.estado === "cancelada");
  const completadas = citas.filter((c) => c.estado === "completada");
  const baseAsistencia = completadas.length + noPresentadas.length;

  // Ingresos perdidos: precio del servicio + sus complementos, para las
  // citas que no llegaron a cobrarse (cancelada o no_presentada).
  const idsAfectadas = [...noPresentadas, ...canceladas].map((c) => c.id);
  const { data: extras } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos")
    .in("cita_id", idsAfectadas.length ? idsAfectadas : ["00000000-0000-0000-0000-000000000000"]);
  const extrasPorCita = new Map<string, number>();
  for (const e of extras ?? []) {
    extrasPorCita.set(e.cita_id, (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos);
  }
  const ingresosPerdidosCentimos = [...noPresentadas, ...canceladas].reduce((acc, c) => {
    const servicio = uno(c.servicio);
    return acc + (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
  }, 0);

  // --- Desglose por barbero ---
  const porBarberoMap = new Map<string, { nombre: string; completadas: number; noPresentadas: number; canceladas: number }>();
  for (const c of citas) {
    if (c.estado !== "completada" && c.estado !== "no_presentada" && c.estado !== "cancelada") continue;
    const profesional = uno(c.profesional);
    const clave = c.profesional_id ?? "sin-asignar";
    const actual = porBarberoMap.get(clave) ?? { nombre: profesional?.nombre ?? "Sin asignar", completadas: 0, noPresentadas: 0, canceladas: 0 };
    if (c.estado === "completada") actual.completadas++;
    if (c.estado === "no_presentada") actual.noPresentadas++;
    if (c.estado === "cancelada") actual.canceladas++;
    porBarberoMap.set(clave, actual);
  }
  const porBarbero = Array.from(porBarberoMap.values())
    .map((b) => ({ ...b, pctNoShow: pct(b.noPresentadas, b.completadas + b.noPresentadas) }))
    .sort((a, b) => b.pctNoShow - a.pctNoShow);

  // --- Desglose por servicio ---
  const porServicioMap = new Map<string, { nombre: string; completadas: number; noPresentadas: number; canceladas: number }>();
  for (const c of citas) {
    if (c.estado !== "completada" && c.estado !== "no_presentada" && c.estado !== "cancelada") continue;
    const servicio = uno(c.servicio);
    const nombre = servicio?.nombre ?? "Servicio";
    const actual = porServicioMap.get(nombre) ?? { nombre, completadas: 0, noPresentadas: 0, canceladas: 0 };
    if (c.estado === "completada") actual.completadas++;
    if (c.estado === "no_presentada") actual.noPresentadas++;
    if (c.estado === "cancelada") actual.canceladas++;
    porServicioMap.set(nombre, actual);
  }
  const porServicio = Array.from(porServicioMap.values())
    .map((s) => ({ ...s, pctNoShow: pct(s.noPresentadas, s.completadas + s.noPresentadas) }))
    .sort((a, b) => b.canceladas + b.noPresentadas - (a.canceladas + a.noPresentadas));

  // --- Desglose por canal ---
  const porCanalMap = new Map<string, { canal: string; completadas: number; noPresentadas: number; canceladas: number }>();
  for (const c of citas) {
    const actual = porCanalMap.get(c.origen) ?? { canal: c.origen, completadas: 0, noPresentadas: 0, canceladas: 0 };
    if (c.estado === "completada") actual.completadas++;
    if (c.estado === "no_presentada") actual.noPresentadas++;
    if (c.estado === "cancelada") actual.canceladas++;
    porCanalMap.set(c.origen, actual);
  }
  const porCanal = Array.from(porCanalMap.values()).map((c) => ({ ...c, pctNoShow: pct(c.noPresentadas, c.completadas + c.noPresentadas) }));

  // --- Tendencia en el tiempo ---
  const granularidad = granularidadParaRango(rango.totalDias);
  const buckets = generarBuckets(rango, granularidad);
  const asistenciaPorBucket = new Map<string, { completadas: number; noPresentadas: number; canceladas: number }>();
  for (const c of citas) {
    if (c.estado !== "completada" && c.estado !== "no_presentada" && c.estado !== "cancelada") continue;
    const { clave } = bucketDe(c.inicio, granularidad);
    const actual = asistenciaPorBucket.get(clave) ?? { completadas: 0, noPresentadas: 0, canceladas: 0 };
    if (c.estado === "completada") actual.completadas++;
    if (c.estado === "no_presentada") actual.noPresentadas++;
    if (c.estado === "cancelada") actual.canceladas++;
    asistenciaPorBucket.set(clave, actual);
  }
  const tendencia = buckets.map((b) => {
    const datos = asistenciaPorBucket.get(b.clave) ?? { completadas: 0, noPresentadas: 0, canceladas: 0 };
    return { etiqueta: b.etiqueta, pctNoShow: pct(datos.noPresentadas, datos.completadas + datos.noPresentadas), canceladas: datos.canceladas };
  });

  return NextResponse.json({
    totalCitas: citas.length,
    noPresentadasCount: noPresentadas.length,
    canceladasCount: canceladas.length,
    completadasCount: completadas.length,
    pctNoShow: pct(noPresentadas.length, baseAsistencia),
    pctCancelacion: pct(canceladas.length, citas.length),
    ingresosPerdidosCentimos,
    porBarbero,
    porServicio,
    porCanal,
    tendencia,
  });
}

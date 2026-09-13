import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango, rangoAnterior, variacionPct, granularidadParaRango, bucketDe, generarBuckets } from "@/lib/informes";

export const dynamic = "force-dynamic";

interface CitaFila {
  id: string;
  sede_id: string;
  profesional_id: string | null;
  origen: string;
  estado: string;
  inicio: string;
  profesional: { nombre: string } | { nombre: string }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
  sede: { nombre: string } | { nombre: string }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Ingresos totales (servicio + extras) de un conjunto de citas completadas,
// dado el mapa de extras por cita_id ya cargado.
async function calcularIngresos(supabase: ReturnType<typeof createAdminClient>, citasCompletadas: CitaFila[]) {
  const ids = citasCompletadas.map((c) => c.id);
  const { data: extras } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos")
    .in("cita_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const extrasPorCita = new Map<string, number>();
  for (const e of extras ?? []) {
    extrasPorCita.set(e.cita_id, (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos);
  }
  return { extrasPorCita, ingresosTotalCentimos: citasCompletadas.reduce((acc, c) => {
    const servicio = uno(c.servicio);
    return acc + (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
  }, 0) };
}

/**
 * Resumen de ingresos y tendencia: KPIs (ingresos, ticket medio, nº citas,
 * comparación con el periodo anterior), serie temporal, ingresos por sede
 * y por barbero, top servicios/complementos y desglose por canal.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId"); // "todas" o un id
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");
  const comparar = params.get("comparar") === "1";
  if (!desdeStr || !hastaStr) {
    return NextResponse.json({ error: "Faltan desde y hasta." }, { status: 400 });
  }

  const rango = parseRango(desdeStr, hastaStr);
  const supabase = createAdminClient();

  const SELECT =
    "id, sede_id, profesional_id, origen, estado, inicio, profesional:profesionales(nombre), servicio:servicios(nombre, precio_centimos), sede:sedes(nombre)";

  let query = supabase.from("citas").select(SELECT).gte("inicio", rango.desdeUTC.toISOString()).lte("inicio", rango.hastaUTC.toISOString());
  if (sedeId && sedeId !== "todas") query = query.eq("sede_id", sedeId);
  const { data: citasCrudas } = await query;
  const citas = (citasCrudas ?? []) as unknown as CitaFila[];
  const citasCompletadas = citas.filter((c) => c.estado === "completada");

  const { extrasPorCita, ingresosTotalCentimos } = await calcularIngresos(supabase, citasCompletadas);
  const ticketMedioCentimos = citasCompletadas.length > 0 ? Math.round(ingresosTotalCentimos / citasCompletadas.length) : 0;

  // --- Comparación con el periodo anterior (mismo nº de días, justo antes) ---
  let ingresosAnteriorCentimos: number | null = null;
  let variacionIngresosPct: number | null = null;
  let citasAnteriorCount: number | null = null;
  if (comparar) {
    const anterior = rangoAnterior(rango);
    let queryAnterior = supabase
      .from("citas")
      .select("id, estado, servicio:servicios(precio_centimos)")
      .gte("inicio", anterior.desdeUTC.toISOString())
      .lte("inicio", anterior.hastaUTC.toISOString())
      .eq("estado", "completada");
    if (sedeId && sedeId !== "todas") queryAnterior = queryAnterior.eq("sede_id", sedeId);
    const { data: citasAnteriorCrudas } = await queryAnterior;
    const citasAnterior = (citasAnteriorCrudas ?? []) as unknown as CitaFila[];
    const { ingresosTotalCentimos: ingresosAnterior } = await calcularIngresos(supabase, citasAnterior);
    ingresosAnteriorCentimos = ingresosAnterior;
    variacionIngresosPct = variacionPct(ingresosTotalCentimos, ingresosAnterior);
    citasAnteriorCount = citasAnterior.length;
  }

  // --- Serie temporal de ingresos ---
  const granularidad = granularidadParaRango(rango.totalDias);
  const buckets = generarBuckets(rango, granularidad);
  const ingresosPorBucket = new Map<string, number>();
  for (const c of citasCompletadas) {
    const servicio = uno(c.servicio);
    const ingresoCita = (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
    const { clave } = bucketDe(c.inicio, granularidad);
    ingresosPorBucket.set(clave, (ingresosPorBucket.get(clave) ?? 0) + ingresoCita);
  }
  const serieIngresos = buckets.map((b) => ({ etiqueta: b.etiqueta, ingresosCentimos: ingresosPorBucket.get(b.clave) ?? 0 }));

  // --- Ingresos por sede y por barbero ---
  const porSedeMap = new Map<string, { nombre: string; ingresosCentimos: number }>();
  const porBarberoMap = new Map<string, { nombre: string; ingresosCentimos: number }>();
  for (const c of citasCompletadas) {
    const servicio = uno(c.servicio);
    const ingresoCita = (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);

    const sede = uno(c.sede);
    const claveSede = c.sede_id;
    const actualSede = porSedeMap.get(claveSede) ?? { nombre: sede?.nombre ?? "Sede", ingresosCentimos: 0 };
    actualSede.ingresosCentimos += ingresoCita;
    porSedeMap.set(claveSede, actualSede);

    const profesional = uno(c.profesional);
    const claveBarbero = c.profesional_id ?? "sin-asignar";
    const actualBarbero = porBarberoMap.get(claveBarbero) ?? { nombre: profesional?.nombre ?? "Sin asignar", ingresosCentimos: 0 };
    actualBarbero.ingresosCentimos += ingresoCita;
    porBarberoMap.set(claveBarbero, actualBarbero);
  }
  const ingresosPorSede = Array.from(porSedeMap.values()).sort((a, b) => b.ingresosCentimos - a.ingresosCentimos);
  const ingresosPorBarbero = Array.from(porBarberoMap.values()).sort((a, b) => b.ingresosCentimos - a.ingresosCentimos);

  // --- Top servicios y complementos ---
  const idsCitasCompletadas = citasCompletadas.map((c) => c.id);
  const { data: extrasConNombre } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos, servicio:servicios(nombre)")
    .in("cita_id", idsCitasCompletadas.length ? idsCitasCompletadas : ["00000000-0000-0000-0000-000000000000"]);

  const conteoServicios = new Map<string, { nombre: string; cantidad: number; ingresosCentimos: number }>();
  for (const c of citasCompletadas) {
    const servicio = uno(c.servicio);
    const nombre = servicio?.nombre ?? "Servicio";
    const actual = conteoServicios.get(nombre) ?? { nombre, cantidad: 0, ingresosCentimos: 0 };
    actual.cantidad += 1;
    actual.ingresosCentimos += servicio?.precio_centimos ?? 0;
    conteoServicios.set(nombre, actual);
  }
  for (const e of extrasConNombre ?? []) {
    const servicio = uno(e.servicio as { nombre: string } | { nombre: string }[] | null);
    const nombre = servicio?.nombre ?? "Complemento";
    const actual = conteoServicios.get(nombre) ?? { nombre, cantidad: 0, ingresosCentimos: 0 };
    actual.cantidad += 1;
    actual.ingresosCentimos += e.precio_centimos;
    conteoServicios.set(nombre, actual);
  }
  const topServicios = Array.from(conteoServicios.values())
    .sort((a, b) => b.ingresosCentimos - a.ingresosCentimos)
    .slice(0, 10);

  // --- Desglose por canal (origen de la reserva) ---
  const porCanalMap = new Map<string, { canal: string; citas: number; ingresosCentimos: number }>();
  for (const c of citasCompletadas) {
    const servicio = uno(c.servicio);
    const ingresoCita = (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
    const actual = porCanalMap.get(c.origen) ?? { canal: c.origen, citas: 0, ingresosCentimos: 0 };
    actual.citas += 1;
    actual.ingresosCentimos += ingresoCita;
    porCanalMap.set(c.origen, actual);
  }
  const porCanal = Array.from(porCanalMap.values()).sort((a, b) => b.ingresosCentimos - a.ingresosCentimos);

  return NextResponse.json({
    ingresosTotalCentimos,
    ticketMedioCentimos,
    citasCompletadasCount: citasCompletadas.length,
    ingresosAnteriorCentimos,
    variacionIngresosPct,
    citasAnteriorCount,
    granularidad,
    serieIngresos,
    ingresosPorSede,
    ingresosPorBarbero,
    topServicios,
    porCanal,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseRango,
  granularidadParaRango,
  bucketDe,
  generarBuckets,
  TZ,
} from "@/lib/informes";
import { precioCitaCentimos } from "@/lib/precios";

export const dynamic = "force-dynamic";

// Un cliente "en riesgo" es quien ya lleva un tiempo sin volver pero
// todavía no ha cruzado el umbral de "inactivo" de la campaña automática
// de retención (60 días, ver lib/retencion.ts) — para verlo venir antes
// de que el aviso automático se dispare.
const RIESGO_DESDE_DIAS = 45;
const RIESGO_HASTA_DIAS = 89;

interface CitaLigera {
  cliente_id: string;
  inicio: string;
}
interface CitaConValor {
  id: string;
  cliente_id: string;
  inicio: string;
  // Igual que en /api/admin/informes/resumen: si se pagó con saldo no
  // entró dinero real, y precio_final_centimos (cuando lo hay) es el
  // importe que de verdad se cobró, no el automático de catálogo.
  saldo_canjeado_centimos: number;
  precio_final_centimos: number | null;
  cliente: { nombre: string } | { nombre: string }[] | null;
  servicio: { precio_centimos: number } | { precio_centimos: number }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Clientes: nuevos vs. recurrentes en el rango elegido, tasa de
 * recurrencia histórica, valor medio y top clientes por gasto, y quiénes
 * están "en riesgo" de volverse inactivos.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");
  if (!desdeStr || !hastaStr) {
    return NextResponse.json(
      { error: "Faltan desde y hasta." },
      { status: 400 },
    );
  }

  const rango = parseRango(desdeStr, hastaStr);
  const supabase = createAdminClient();
  const filtrarSede = sedeId && sedeId !== "todas";

  // --- Histórico completo (ligero: solo cliente_id + inicio) para saber,
  // de cada cliente, cuándo fue su primera y su última visita, y cuántas
  // lleva en total — sin límite de fechas, porque "primera visita" y
  // "última visita" son datos de toda la vida del cliente, no del rango.
  let historicoQuery = supabase
    .from("citas")
    .select("cliente_id, inicio")
    .eq("estado", "completada");
  if (filtrarSede) historicoQuery = historicoQuery.eq("sede_id", sedeId);
  const { data: historicoCrudo } = await historicoQuery;
  const historico = (historicoCrudo ?? []) as CitaLigera[];

  const porCliente = new Map<
    string,
    { count: number; primera: string; ultima: string }
  >();
  for (const c of historico) {
    const actual = porCliente.get(c.cliente_id);
    if (!actual) {
      porCliente.set(c.cliente_id, {
        count: 1,
        primera: c.inicio,
        ultima: c.inicio,
      });
    } else {
      actual.count++;
      if (c.inicio < actual.primera) actual.primera = c.inicio;
      if (c.inicio > actual.ultima) actual.ultima = c.inicio;
    }
  }

  const totalClientesConVisita = porCliente.size;
  const clientesRecurrentesHistorico = Array.from(porCliente.values()).filter(
    (c) => c.count > 1,
  ).length;
  const tasaRecurrenciaHistoricaPct =
    totalClientesConVisita > 0
      ? Math.round(
          (clientesRecurrentesHistorico / totalClientesConVisita) * 1000,
        ) / 10
      : 0;

  const hoyLocal = toZonedTime(new Date(), TZ);
  let clientesEnRiesgo = 0;
  for (const info of porCliente.values()) {
    const dias = differenceInCalendarDays(
      hoyLocal,
      toZonedTime(new Date(info.ultima), TZ),
    );
    if (dias >= RIESGO_DESDE_DIAS && dias <= RIESGO_HASTA_DIAS)
      clientesEnRiesgo++;
  }

  // --- Citas completadas DENTRO del rango, con precio, para ingresos por
  // cliente, top clientes y la serie nuevos/recurrentes ---
  let rangoQuery = supabase
    .from("citas")
    .select(
      "id, cliente_id, inicio, saldo_canjeado_centimos, precio_final_centimos, cliente:clientes(nombre), servicio:servicios(precio_centimos)",
    )
    .eq("estado", "completada")
    // Un recibo anulado y archivado no es dinero real: fuera de ingresos
    // por cliente, top clientes y valor medio (pedido de Diego, 25/09/2026).
    .is("recibo_anulado_at", null)
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString());
  if (filtrarSede) rangoQuery = rangoQuery.eq("sede_id", sedeId);
  const { data: citasRangoCrudas } = await rangoQuery;
  const citasRango = (citasRangoCrudas ?? []) as unknown as CitaConValor[];

  const idsRango = citasRango.map((c) => c.id);
  const idsRangoSeguro = idsRango.length
    ? idsRango
    : ["00000000-0000-0000-0000-000000000000"];
  const [{ data: extras }, { data: productos }] = await Promise.all([
    supabase
      .from("cita_extras")
      .select("cita_id, precio_centimos")
      .in("cita_id", idsRangoSeguro),
    supabase
      .from("cita_productos")
      .select("cita_id, cantidad, precio_centimos")
      .in("cita_id", idsRangoSeguro),
  ]);
  const extrasPorCita = new Map<string, number>();
  for (const e of extras ?? []) {
    extrasPorCita.set(
      e.cita_id,
      (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos,
    );
  }
  const productosPorCita = new Map<string, number>();
  for (const p of productos ?? []) {
    productosPorCita.set(
      p.cita_id,
      (productosPorCita.get(p.cita_id) ?? 0) + p.cantidad * p.precio_centimos,
    );
  }

  const ingresosPorCliente = new Map<
    string,
    { nombre: string; ingresosCentimos: number; visitas: number }
  >();
  for (const c of citasRango) {
    const cliente = uno(c.cliente);
    const servicio = uno(c.servicio);
    const automatico =
      (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
    const ingresoCita =
      c.saldo_canjeado_centimos > 0
        ? 0
        : precioCitaCentimos(c.precio_final_centimos, automatico) +
          (productosPorCita.get(c.id) ?? 0);
    const actual = ingresosPorCliente.get(c.cliente_id) ?? {
      nombre: cliente?.nombre ?? "Cliente",
      ingresosCentimos: 0,
      visitas: 0,
    };
    actual.ingresosCentimos += ingresoCita;
    actual.visitas += 1;
    ingresosPorCliente.set(c.cliente_id, actual);
  }
  const ingresosTotalRangoCentimos = Array.from(
    ingresosPorCliente.values(),
  ).reduce((acc, c) => acc + c.ingresosCentimos, 0);
  const clientesDistintosEnRango = ingresosPorCliente.size;
  const valorMedioPorClienteCentimos =
    clientesDistintosEnRango > 0
      ? Math.round(ingresosTotalRangoCentimos / clientesDistintosEnRango)
      : 0;

  const topClientes = Array.from(ingresosPorCliente.values())
    .sort((a, b) => b.ingresosCentimos - a.ingresosCentimos)
    .slice(0, 10);

  // --- Nuevos vs. recurrentes: "nuevo" = su primera visita EN TODA SU
  // HISTORIA cae dentro de este rango; si ya tenía una visita anterior al
  // inicio del rango, es recurrente ---
  const clientesUnicosEnRango = new Set(citasRango.map((c) => c.cliente_id));
  let nuevosCount = 0;
  let recurrentesCount = 0;
  for (const clienteId of clientesUnicosEnRango) {
    const info = porCliente.get(clienteId);
    const esNuevo = !info || info.primera >= rango.desdeUTC.toISOString();
    if (esNuevo) nuevosCount++;
    else recurrentesCount++;
  }

  // --- Serie temporal nuevos vs. recurrentes ---
  const granularidad = granularidadParaRango(rango.totalDias);
  const buckets = generarBuckets(rango, granularidad);
  const primeraVisitaPorCliente = new Map<string, string>();
  for (const [clienteId, info] of porCliente.entries())
    primeraVisitaPorCliente.set(clienteId, info.primera);

  const serieMap = new Map<
    string,
    { nuevos: Set<string>; recurrentes: Set<string> }
  >();
  for (const c of citasRango) {
    const { clave } = bucketDe(c.inicio, granularidad);
    const actual = serieMap.get(clave) ?? {
      nuevos: new Set<string>(),
      recurrentes: new Set<string>(),
    };
    const primera = primeraVisitaPorCliente.get(c.cliente_id);
    const esNuevo = !primera || primera >= rango.desdeUTC.toISOString();
    (esNuevo ? actual.nuevos : actual.recurrentes).add(c.cliente_id);
    serieMap.set(clave, actual);
  }
  const serieNuevosRecurrentes = buckets.map((b) => {
    const datos = serieMap.get(b.clave);
    return {
      etiqueta: b.etiqueta,
      nuevos: datos?.nuevos.size ?? 0,
      recurrentes: datos?.recurrentes.size ?? 0,
    };
  });

  return NextResponse.json({
    nuevosCount,
    recurrentesCount,
    tasaRecurrenciaHistoricaPct,
    clientesEnRiesgo,
    ingresosTotalRangoCentimos,
    clientesDistintosEnRango,
    valorMedioPorClienteCentimos,
    topClientes,
    serieNuevosRecurrentes,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseRango,
  rangoAnterior,
  variacionPct,
  granularidadParaRango,
  bucketDe,
  generarBuckets,
} from "@/lib/informes";
import { precioCitaCentimos } from "@/lib/precios";

export const dynamic = "force-dynamic";

interface CitaFila {
  id: string;
  sede_id: string;
  profesional_id: string | null;
  origen: string;
  estado: string;
  inicio: string;
  // Si es > 0, esta cita se pagó con saldo de fidelización: no entró
  // dinero real, así que no debe sumar a ningún ingreso de este informe
  // (ver ingresoCitaCentimos más abajo) aunque la cita en sí sí cuenta
  // como cita completada.
  saldo_canjeado_centimos: number;
  // Precio corregido a mano al cerrar la cita (checkout del modal
  // "Finalizar cita"), YA con el descuento restado si lo hubiera — ver
  // lib/precios.ts. Si es null, el precio real de esta cita es el
  // automático (servicio + complementos).
  precio_final_centimos: number | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
  servicio:
    | { nombre: string; precio_centimos: number }
    | { nombre: string; precio_centimos: number }[]
    | null;
  sede: { nombre: string } | { nombre: string }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Ingreso real (en dinero) de una cita: precio del servicio + sus
// complementos + los productos vendidos en esa misma cita, respetando el
// precio final corregido a mano si lo hay (mismo criterio que
// /api/admin/comisiones, ver lib/precios.ts) — salvo que se haya pagado
// con saldo de fidelización, en cuyo caso no entró dinero de verdad y no
// debe contar en ningún informe de facturación (ya se contó como gasto
// real cuando se generó ese saldo). Los productos, a diferencia del
// servicio, siempre cuentan enteros: no se pueden pagar con saldo (ver
// lib/productos.ts) y precio_final_centimos nunca los incluye.
function ingresoCitaCentimos(
  c: CitaFila,
  extrasPorCita: Map<string, number>,
  productosPorCita: Map<string, number>,
): number {
  if (c.saldo_canjeado_centimos > 0) return 0;
  const servicio = uno(c.servicio);
  const automatico =
    (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
  return (
    precioCitaCentimos(c.precio_final_centimos, automatico) +
    (productosPorCita.get(c.id) ?? 0)
  );
}

// Ingresos totales (servicio + extras + productos, excluyendo lo pagado
// con saldo) de un conjunto de citas completadas, dados los mapas de
// extras y productos por cita_id ya cargados.
async function calcularIngresos(
  supabase: ReturnType<typeof createAdminClient>,
  citasCompletadas: CitaFila[],
) {
  const ids = citasCompletadas.map((c) => c.id);
  const idsSeguro = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
  const [{ data: extras }, { data: productos }] = await Promise.all([
    supabase
      .from("cita_extras")
      .select("cita_id, precio_centimos")
      .in("cita_id", idsSeguro),
    supabase
      .from("cita_productos")
      .select("cita_id, cantidad, precio_centimos")
      .in("cita_id", idsSeguro),
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
  return {
    extrasPorCita,
    productosPorCita,
    ingresosTotalCentimos: citasCompletadas.reduce(
      (acc, c) => acc + ingresoCitaCentimos(c, extrasPorCita, productosPorCita),
      0,
    ),
  };
}

/**
 * Resumen de ingresos y tendencia: KPIs (ingresos, ticket medio, nº citas,
 * comparación con el periodo anterior), serie temporal, ingresos por sede
 * y por barbero, top servicios/complementos y desglose por canal.
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
  const sedeId = params.get("sedeId"); // "todas" o un id
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");
  const comparar = params.get("comparar") === "1";
  if (!desdeStr || !hastaStr) {
    return NextResponse.json(
      { error: "Faltan desde y hasta." },
      { status: 400 },
    );
  }

  const rango = parseRango(desdeStr, hastaStr);
  const supabase = createAdminClient();

  const SELECT =
    "id, sede_id, profesional_id, origen, estado, inicio, saldo_canjeado_centimos, precio_final_centimos, profesional:profesionales(nombre), servicio:servicios(nombre, precio_centimos), sede:sedes(nombre)";

  let query = supabase
    .from("citas")
    .select(SELECT)
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString());
  if (sedeId && sedeId !== "todas") query = query.eq("sede_id", sedeId);
  const { data: citasCrudas } = await query;
  const citas = (citasCrudas ?? []) as unknown as CitaFila[];
  const citasCompletadas = citas.filter((c) => c.estado === "completada");

  const { extrasPorCita, productosPorCita, ingresosTotalCentimos } =
    await calcularIngresos(supabase, citasCompletadas);
  const ticketMedioCentimos =
    citasCompletadas.length > 0
      ? Math.round(ingresosTotalCentimos / citasCompletadas.length)
      : 0;

  // --- Comparación con el periodo anterior (mismo nº de días, justo antes) ---
  let ingresosAnteriorCentimos: number | null = null;
  let variacionIngresosPct: number | null = null;
  let citasAnteriorCount: number | null = null;
  if (comparar) {
    const anterior = rangoAnterior(rango);
    let queryAnterior = supabase
      .from("citas")
      .select(
        "id, estado, saldo_canjeado_centimos, precio_final_centimos, servicio:servicios(precio_centimos)",
      )
      .gte("inicio", anterior.desdeUTC.toISOString())
      .lte("inicio", anterior.hastaUTC.toISOString())
      .eq("estado", "completada");
    if (sedeId && sedeId !== "todas")
      queryAnterior = queryAnterior.eq("sede_id", sedeId);
    const { data: citasAnteriorCrudas } = await queryAnterior;
    const citasAnterior = (citasAnteriorCrudas ?? []) as unknown as CitaFila[];
    const { ingresosTotalCentimos: ingresosAnterior } = await calcularIngresos(
      supabase,
      citasAnterior,
    );
    ingresosAnteriorCentimos = ingresosAnterior;
    variacionIngresosPct = variacionPct(
      ingresosTotalCentimos,
      ingresosAnterior,
    );
    citasAnteriorCount = citasAnterior.length;
  }

  // --- Serie temporal de ingresos ---
  const granularidad = granularidadParaRango(rango.totalDias);
  const buckets = generarBuckets(rango, granularidad);
  const ingresosPorBucket = new Map<string, number>();
  for (const c of citasCompletadas) {
    const ingresoCita = ingresoCitaCentimos(c, extrasPorCita, productosPorCita);
    const { clave } = bucketDe(c.inicio, granularidad);
    ingresosPorBucket.set(
      clave,
      (ingresosPorBucket.get(clave) ?? 0) + ingresoCita,
    );
  }
  const serieIngresos = buckets.map((b) => ({
    etiqueta: b.etiqueta,
    ingresosCentimos: ingresosPorBucket.get(b.clave) ?? 0,
  }));

  // --- Ingresos por sede y por barbero ---
  const porSedeMap = new Map<
    string,
    { nombre: string; ingresosCentimos: number }
  >();
  const porBarberoMap = new Map<
    string,
    { nombre: string; ingresosCentimos: number }
  >();
  for (const c of citasCompletadas) {
    const ingresoCita = ingresoCitaCentimos(c, extrasPorCita, productosPorCita);

    const sede = uno(c.sede);
    const claveSede = c.sede_id;
    const actualSede = porSedeMap.get(claveSede) ?? {
      nombre: sede?.nombre ?? "Sede",
      ingresosCentimos: 0,
    };
    actualSede.ingresosCentimos += ingresoCita;
    porSedeMap.set(claveSede, actualSede);

    const profesional = uno(c.profesional);
    const claveBarbero = c.profesional_id ?? "sin-asignar";
    const actualBarbero = porBarberoMap.get(claveBarbero) ?? {
      nombre: profesional?.nombre ?? "Sin asignar",
      ingresosCentimos: 0,
    };
    actualBarbero.ingresosCentimos += ingresoCita;
    porBarberoMap.set(claveBarbero, actualBarbero);
  }
  const ingresosPorSede = Array.from(porSedeMap.values()).sort(
    (a, b) => b.ingresosCentimos - a.ingresosCentimos,
  );
  const ingresosPorBarbero = Array.from(porBarberoMap.values()).sort(
    (a, b) => b.ingresosCentimos - a.ingresosCentimos,
  );

  // --- Top servicios y complementos ---
  const idsCitasCompletadas = citasCompletadas.map((c) => c.id);
  const { data: extrasConNombre } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos, servicio:servicios(nombre)")
    .in(
      "cita_id",
      idsCitasCompletadas.length
        ? idsCitasCompletadas
        : ["00000000-0000-0000-0000-000000000000"],
    );

  // Citas pagadas con saldo: cuentan igualmente como "vendidas" (cantidad)
  // pero sin ingreso real, igual que en el resto del informe.
  const idsCitasConSaldo = new Set(
    citasCompletadas
      .filter((c) => c.saldo_canjeado_centimos > 0)
      .map((c) => c.id),
  );

  const conteoServicios = new Map<
    string,
    { nombre: string; cantidad: number; ingresosCentimos: number }
  >();
  for (const c of citasCompletadas) {
    const servicio = uno(c.servicio);
    const nombre = servicio?.nombre ?? "Servicio";
    const actual = conteoServicios.get(nombre) ?? {
      nombre,
      cantidad: 0,
      ingresosCentimos: 0,
    };
    actual.cantidad += 1;
    actual.ingresosCentimos += idsCitasConSaldo.has(c.id)
      ? 0
      : (servicio?.precio_centimos ?? 0);
    conteoServicios.set(nombre, actual);
  }
  for (const e of extrasConNombre ?? []) {
    const servicio = uno(
      e.servicio as { nombre: string } | { nombre: string }[] | null,
    );
    const nombre = servicio?.nombre ?? "Complemento";
    const actual = conteoServicios.get(nombre) ?? {
      nombre,
      cantidad: 0,
      ingresosCentimos: 0,
    };
    actual.cantidad += 1;
    actual.ingresosCentimos += idsCitasConSaldo.has(e.cita_id)
      ? 0
      : e.precio_centimos;
    conteoServicios.set(nombre, actual);
  }
  const topServicios = Array.from(conteoServicios.values())
    .sort((a, b) => b.ingresosCentimos - a.ingresosCentimos)
    .slice(0, 10);

  // --- Desglose por canal (origen de la reserva) ---
  const porCanalMap = new Map<
    string,
    { canal: string; citas: number; ingresosCentimos: number }
  >();
  for (const c of citasCompletadas) {
    const ingresoCita = ingresoCitaCentimos(c, extrasPorCita, productosPorCita);
    const actual = porCanalMap.get(c.origen) ?? {
      canal: c.origen,
      citas: 0,
      ingresosCentimos: 0,
    };
    actual.citas += 1;
    actual.ingresosCentimos += ingresoCita;
    porCanalMap.set(c.origen, actual);
  }
  const porCanal = Array.from(porCanalMap.values()).sort(
    (a, b) => b.ingresosCentimos - a.ingresosCentimos,
  );

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

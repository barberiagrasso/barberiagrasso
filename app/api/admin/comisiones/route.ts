import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango } from "@/lib/informes";
import { calcularComision, calcularRanking, rangoDelMes, siguienteTramo, mesActualStr, type TramoComision } from "@/lib/comisiones";
import { calcularComisionProductos } from "@/lib/productos";
import { precioCitaCentimos } from "@/lib/precios";

export const dynamic = "force-dynamic";

interface CitaFila {
  id: string;
  profesional_id: string | null;
  saldo_canjeado_centimos: number;
  precio_final_centimos: number | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
  servicio: { precio_centimos: number } | { precio_centimos: number }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Mismo criterio que /api/admin/informes/resumen: el precio del servicio
// más sus complementos (o el precio final corregido a mano al cerrar la
// cita, si lo hay — ver lib/precios.ts), salvo que se haya pagado con
// saldo de fidelización (ahí no entró dinero real, así que tampoco debe
// generar comisión — ya se contó como gasto real cuando se generó ese saldo).
function ingresoCitaCentimos(c: CitaFila, extrasPorCita: Map<string, number>): number {
  if (c.saldo_canjeado_centimos > 0) return 0;
  const servicio = uno(c.servicio);
  const automatico = (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
  return precioCitaCentimos(c.precio_final_centimos, automatico);
}

interface FilaComision {
  profesionalId: string;
  nombre: string;
  facturacionCentimos: number;
  citasCompletadas: number;
  comisionCentimos: number;
  tramo: TramoComision | null;
  siguienteTramo: TramoComision | null;
  posicion: number;
  totalBarberos: number;
  // Venta de productos: aparte de la facturación de servicios, con su
  // propia comisión plana (sin tramos, ver lib/productos.ts) — no cuenta
  // para el ranking, que sigue siendo solo por servicios.
  productosCentimos: number;
  comisionProductosCentimos: number;
}

/**
 * Facturación, tramo, comisión y ranking de cada barbero para un mes
 * dado. Internamente SIEMPRE se calcula a todo el equipo (el ranking de
 * un barbero no se puede saber sin comparar con el resto), pero un
 * barbero (rol "barbero") solo recibe SU PROPIA fila — el filtrado es en
 * el servidor, no en el cliente, para que nunca viaje por la red la
 * facturación o comisión de un compañero, solo el número de su propia
 * posición. Tampoco recibe los totales del equipo. El rol "admin" recibe
 * a todo el equipo activo (con 0€ los que no hayan facturado nada ese
 * mes) más a cualquier barbero ya dado de baja que sí facturara ese mes,
 * y sí ve los totales.
 */
export async function GET(request: NextRequest) {
  let admin: { rol: string; profesional_id: string | null };
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const mes = request.nextUrl.searchParams.get("mes") || mesActualStr();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  if (admin.rol === "barbero" && !admin.profesional_id) {
    return NextResponse.json({ error: "Tu cuenta no está enlazada a ningún profesional." }, { status: 400 });
  }

  const { desdeStr, hastaStr } = rangoDelMes(mes);
  const rango = parseRango(desdeStr, hastaStr);
  const supabase = createAdminClient();

  const { data: tramosCrudos } = await supabase.from("comisiones_tramos").select("desde_centimos, hasta_centimos, porcentaje").order("desde_centimos");
  const tramos: TramoComision[] = (tramosCrudos ?? []).map((t) => ({
    desdeCentimos: t.desde_centimos,
    hastaCentimos: t.hasta_centimos,
    porcentaje: Number(t.porcentaje),
  }));

  const { data: configProductos } = await supabase.from("comisiones_config_productos").select("porcentaje").eq("id", true).maybeSingle();
  const porcentajeProductos = Number(configProductos?.porcentaje ?? 0);

  // Siempre se piden las citas de TODO el equipo (no solo las del
  // barbero que pregunta): su ranking depende de comparar con el resto,
  // aunque luego solo se le devuelva a él su propia fila.
  const { data: citasCrudas } = await supabase
    .from("citas")
    .select("id, profesional_id, saldo_canjeado_centimos, precio_final_centimos, profesional:profesionales(nombre), servicio:servicios(precio_centimos)")
    .eq("estado", "completada")
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString())
    .not("profesional_id", "is", null); // sin barbero asignado no hay a quién pagarle comisión

  const citas = (citasCrudas ?? []) as unknown as CitaFila[];

  const idsCitas = citas.map((c) => c.id);
  const { data: extras } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos")
    .in("cita_id", idsCitas.length ? idsCitas : ["00000000-0000-0000-0000-000000000000"]);
  const extrasPorCita = new Map<string, number>();
  for (const e of extras ?? []) {
    extrasPorCita.set(e.cita_id, (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos);
  }

  // Venta de productos del mes: siempre cuenta entera (a diferencia de
  // los servicios, un producto no se puede pagar con saldo de
  // fidelización, así que no hay nada que restar aquí).
  const { data: productosCrudos } = await supabase
    .from("cita_productos")
    .select("cita_id, cantidad, precio_centimos")
    .in("cita_id", idsCitas.length ? idsCitas : ["00000000-0000-0000-0000-000000000000"]);
  const productosPorCita = new Map<string, number>();
  for (const p of productosCrudos ?? []) {
    productosPorCita.set(p.cita_id, (productosPorCita.get(p.cita_id) ?? 0) + p.cantidad * p.precio_centimos);
  }

  // Agrega facturación y nº de citas por profesional a partir de las
  // citas reales del mes — cubre también a un barbero ya dado de baja
  // que facturara ese mes (no aparecería en el roster de activos de
  // abajo, pero su comisión de ese mes sigue siendo un dato real).
  const porProfesional = new Map<
    string,
    { nombre: string; facturacionCentimos: number; citasCompletadas: number; productosCentimos: number }
  >();
  for (const c of citas) {
    if (!c.profesional_id) continue;
    const nombre = uno(c.profesional)?.nombre ?? "Sin nombre";
    const actual = porProfesional.get(c.profesional_id) ?? { nombre, facturacionCentimos: 0, citasCompletadas: 0, productosCentimos: 0 };
    actual.facturacionCentimos += ingresoCitaCentimos(c, extrasPorCita);
    actual.citasCompletadas += 1;
    actual.productosCentimos += productosPorCita.get(c.id) ?? 0;
    porProfesional.set(c.profesional_id, actual);
  }

  // Añade con 0€ a cualquier profesional activo que no haya facturado
  // nada este mes, para que el roster completo del equipo (y por tanto
  // el ranking) sea real de verdad, incluidos los que están a 0.
  const { data: activos } = await supabase.from("profesionales").select("id, nombre").eq("activo", true);
  for (const p of activos ?? []) {
    if (!porProfesional.has(p.id)) {
      porProfesional.set(p.id, { nombre: p.nombre, facturacionCentimos: 0, citasCompletadas: 0, productosCentimos: 0 });
    }
  }

  const filasSinRanking = Array.from(porProfesional.entries()).map(([profesionalId, datos]) => {
    const { comisionCentimos, tramo } = calcularComision(datos.facturacionCentimos, tramos);
    return {
      profesionalId,
      nombre: datos.nombre,
      facturacionCentimos: datos.facturacionCentimos,
      citasCompletadas: datos.citasCompletadas,
      comisionCentimos,
      tramo,
      siguienteTramo: siguienteTramo(datos.facturacionCentimos, tramos),
      productosCentimos: datos.productosCentimos,
      comisionProductosCentimos: calcularComisionProductos(datos.productosCentimos, porcentajeProductos),
    };
  });

  const filasConRanking: FilaComision[] = calcularRanking(filasSinRanking).map((f) => ({
    ...f,
    totalBarberos: f.total,
  }));
  filasConRanking.sort((a, b) => b.facturacionCentimos - a.facturacionCentimos);

  if (admin.rol === "barbero") {
    const propia = filasConRanking.find((f) => f.profesionalId === admin.profesional_id);
    return NextResponse.json({
      mes,
      filas: propia ? [propia] : [],
      totalComisionCentimos: null,
      totalFacturacionCentimos: null,
      totalProductosCentimos: null,
      totalComisionProductosCentimos: null,
      porcentajeProductos,
    });
  }

  const totalComisionCentimos = filasConRanking.reduce((acc, f) => acc + f.comisionCentimos, 0);
  const totalFacturacionCentimos = filasConRanking.reduce((acc, f) => acc + f.facturacionCentimos, 0);
  const totalProductosCentimos = filasConRanking.reduce((acc, f) => acc + f.productosCentimos, 0);
  const totalComisionProductosCentimos = filasConRanking.reduce((acc, f) => acc + f.comisionProductosCentimos, 0);

  return NextResponse.json({
    mes,
    filas: filasConRanking,
    totalComisionCentimos,
    totalFacturacionCentimos,
    totalProductosCentimos,
    totalComisionProductosCentimos,
    porcentajeProductos,
  });
}

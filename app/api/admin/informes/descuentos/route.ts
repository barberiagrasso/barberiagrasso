import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRango } from "@/lib/informes";

export const dynamic = "force-dynamic";

interface CitaFila {
  id: string;
  inicio: string;
  precio_final_centimos: number | null;
  descuento_porcentaje: number;
  descuento_motivo: string | null;
  cliente: { nombre: string } | { nombre: string }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Todos los descuentos por % con motivo aplicados desde el checkout
 * (FinalizarCitaModal.tsx) en un rango de fechas — para que Diego pueda
 * revisar de un vistazo qué ofertas o detalles puntuales se han dado,
 * cuánto ha dejado de ingresar la barbería por ellos, y quién los aplicó.
 * Solo rol "admin" (igual que el resto de Informes) — un barbero no ve
 * los descuentos de sus compañeros.
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
  const supabase = createAdminClient();

  let query = supabase
    .from("citas")
    .select(
      "id, inicio, precio_final_centimos, descuento_porcentaje, descuento_motivo, cliente:clientes(nombre), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre)"
    )
    .not("descuento_porcentaje", "is", null)
    .gte("inicio", rango.desdeUTC.toISOString())
    .lte("inicio", rango.hastaUTC.toISOString())
    .order("inicio", { ascending: false });
  if (sedeId && sedeId !== "todas") query = query.eq("sede_id", sedeId);
  const { data: citasCrudas } = await query;
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

  // El importe descontado se calcula frente al automático de catálogo
  // (servicio + complementos), no frente a precio_final_centimos de
  // ANTES del descuento (ese número ya no se guarda) — es exactamente lo
  // mismo que usa la comisión para no penalizar al barbero (ver
  // ingresoCitaCentimos en app/api/admin/comisiones/route.ts).
  const filas = citas.map((c) => {
    const servicio = uno(c.servicio);
    const automatico = (servicio?.precio_centimos ?? 0) + (extrasPorCita.get(c.id) ?? 0);
    const cobradoCentimos = c.precio_final_centimos ?? automatico;
    const descuentoCentimos = Math.max(0, automatico - cobradoCentimos);
    return {
      id: c.id,
      inicio: c.inicio,
      clienteNombre: uno(c.cliente)?.nombre ?? "Cliente",
      servicioNombre: servicio?.nombre ?? "Servicio",
      profesionalNombre: uno(c.profesional)?.nombre ?? "Sin asignar",
      porcentaje: Number(c.descuento_porcentaje),
      motivo: c.descuento_motivo ?? "",
      automaticoCentimos: automatico,
      cobradoCentimos,
      descuentoCentimos,
    };
  });

  const totalDescuentosCentimos = filas.reduce((acc, f) => acc + f.descuentoCentimos, 0);

  return NextResponse.json({
    filas,
    totalDescuentos: filas.length,
    totalDescuentosCentimos,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarPorcentajeProductos } from "@/lib/productos";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// El porcentaje plano de comisión sobre venta de productos (sin tramos,
// desde el primer euro — ver lib/productos.ts). Lectura para cualquier
// admin o barbero (lo necesitan para ver su propia comisión), escritura
// solo para el rol "admin" (igual que los tramos de comisión por
// servicios).
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("comisiones_config_productos").select("porcentaje").eq("id", true).maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudo cargar la configuración." }, { status: 500 });
  return NextResponse.json({ porcentaje: Number(data?.porcentaje ?? 0) });
}

export async function PUT(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const porcentaje = Number(body?.porcentaje);
  const errorValidacion = validarPorcentajeProductos(porcentaje);
  if (errorValidacion) return NextResponse.json({ error: errorValidacion }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("comisiones_config_productos")
    .update({ porcentaje, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    await registrarError({ origen: "servidor", mensaje: "No se pudo guardar el porcentaje de comisión de productos.", detalle: error });
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, porcentaje });
}

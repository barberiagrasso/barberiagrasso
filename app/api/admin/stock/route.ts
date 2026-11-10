import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sedesDeStock } from "@/lib/stockAcceso";
import { estadoStock, unidadesAPedir } from "@/lib/stock";

export const dynamic = "force-dynamic";

// Stock de una sede: cada producto activo con su stock, mínimo, ideal y
// cuánto pedir, más los últimos movimientos. Para el dueño, además, quién
// es el encargado de cada sede y las cuentas que puede elegir.
export async function GET(request: NextRequest) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { sedes, faltaSql } = await sedesDeStock(admin);
  if (faltaSql) {
    return NextResponse.json({ faltaSql: true, error: "Falta activar el stock en la base de datos (supabase/anadir-stock-por-sede.sql)." }, { status: 503 });
  }
  if (sedes.length === 0) return NextResponse.json({ error: "No eres encargado de stock de ninguna sede." }, { status: 403 });

  const pedida = request.nextUrl.searchParams.get("sedeId");
  const sede = sedes.find((s) => s.id === pedida) ?? sedes[0];
  const supabase = createAdminClient();

  const [{ data: productos }, { data: filas }, { data: movimientos }, cuentas] = await Promise.all([
    supabase.from("productos").select("id, nombre, categoria").eq("activo", true).order("categoria", { nullsFirst: true }).order("orden"),
    supabase.from("producto_stock_sede").select("producto_id, stock, stock_minimo, stock_ideal, updated_at").eq("sede_id", sede.id),
    supabase
      .from("stock_movimientos")
      .select("id, producto_id, tipo, cantidad, stock_resultante, nota, admin_nombre, created_at")
      .eq("sede_id", sede.id)
      .order("created_at", { ascending: false })
      .limit(40),
    admin.rol === "admin"
      ? supabase.from("admins").select("id, nombre, rol").order("nombre")
      : Promise.resolve({ data: null }),
  ]);

  type FilaStock = { producto_id: string; stock: number; stock_minimo: number; stock_ideal: number; updated_at: string };
  const porProducto = new Map<string, FilaStock>(((filas ?? []) as FilaStock[]).map((f) => [f.producto_id, f]));
  const nombres = new Map<string, string>(((productos ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));
  const lista = (productos ?? []).map((p) => {
    const f = porProducto.get(p.id);
    const stock = f?.stock ?? 0;
    const minimo = f?.stock_minimo ?? 3;
    const ideal = f?.stock_ideal ?? 10;
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      stock,
      minimo,
      ideal,
      contado: Boolean(f),
      actualizado: f?.updated_at ?? null,
      estado: estadoStock(stock, minimo),
      aPedir: unidadesAPedir(stock, minimo, ideal),
    };
  });

  return NextResponse.json({
    esAdmin: admin.rol === "admin",
    sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, encargadoId: s.encargado_stock_admin_id })),
    sedeId: sede.id,
    productos: lista,
    movimientos: (movimientos ?? []).map((m) => ({ ...m, producto: nombres.get(m.producto_id) ?? "Producto" })),
    cuentas: (cuentas.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre ?? "Sin nombre", rol: c.rol })),
  });
}

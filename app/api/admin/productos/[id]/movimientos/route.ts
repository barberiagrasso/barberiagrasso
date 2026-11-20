import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Historial de movimientos de stock de un producto (pedido de Diego,
// 13/11/2026), de solo lectura — ver
// supabase/anadir-historial-movimientos-stock.sql. Cualquier cuenta de
// admin o de equipo puede verlo (igual criterio que ver el propio
// catálogo de productos), no solo rol "admin".
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("movimientos_stock")
    .select("id, tipo, cantidad, stock_resultante, motivo, cita_id, creado_por, created_at")
    .eq("producto_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 400 });
  return NextResponse.json({ movimientos: data ?? [] });
}

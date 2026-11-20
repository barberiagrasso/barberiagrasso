import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Mínimo y cantidad ideal de un producto en una sede. Solo el dueño.
export async function PATCH(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  const minimo = Number(body?.minimo);
  const ideal = Number(body?.ideal);
  if (!Number.isInteger(minimo) || !Number.isInteger(ideal) || minimo < 0 || ideal < 0 || ideal > 10000) {
    return NextResponse.json({ error: "Mínimo e ideal tienen que ser números enteros." }, { status: 400 });
  }
  if (ideal < minimo) return NextResponse.json({ error: "La cantidad ideal no puede ser menor que el mínimo." }, { status: 400 });

  const { error } = await createAdminClient()
    .from("producto_stock_sede")
    .upsert(
      { producto_id: body.productoId, sede_id: body.sedeId, stock_minimo: minimo, stock_ideal: ideal, updated_at: new Date().toISOString() },
      { onConflict: "producto_id,sede_id", ignoreDuplicates: false },
    );
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

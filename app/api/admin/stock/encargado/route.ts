import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// El dueño elige el encargado de stock de una sede (o lo quita).
export async function PUT(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  const adminId = typeof body?.adminId === "string" && body.adminId ? body.adminId : null;
  const supabase = createAdminClient();
  if (adminId) {
    const { data } = await supabase.from("admins").select("id").eq("id", adminId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Esa cuenta no existe." }, { status: 400 });
  }
  const { error } = await supabase.from("sedes").update({ encargado_stock_admin_id: adminId }).eq("id", body?.sedeId);
  if (error) return NextResponse.json({ error: "No se pudo guardar el encargado." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

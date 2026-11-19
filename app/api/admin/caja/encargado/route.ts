import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// El dueño elige quién puede cerrar la caja de una sede (o lo quita).
export async function PUT(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  const adminId = typeof body?.adminId === "string" && body.adminId ? body.adminId : null;
  const { error } = await createAdminClient().from("sedes").update({ encargado_caja_admin_id: adminId }).eq("id", body?.sedeId);
  if (error) return NextResponse.json({ error: "No se pudo guardar el encargado." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

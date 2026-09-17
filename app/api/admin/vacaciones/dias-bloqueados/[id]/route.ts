import { NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Quita un bloqueo de fechas para vacaciones. Solo el rol "admin".
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("dias_bloqueados_vacaciones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo quitar el bloqueo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

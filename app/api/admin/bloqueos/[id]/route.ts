import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("bloqueos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo eliminar el bloqueo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

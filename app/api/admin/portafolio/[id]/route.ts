import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_PORTAFOLIO } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

/** Borra una foto del portafolio (la fila y su archivo). Solo rol "admin". */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: foto } = await supabase.from("portafolio_fotos").select("id, ruta_storage").eq("id", id).maybeSingle();
  if (!foto) return NextResponse.json({ error: "Foto no encontrada." }, { status: 404 });

  const { error } = await supabase.from("portafolio_fotos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo borrar la foto." }, { status: 500 });
  await supabase.storage.from(BUCKET_PORTAFOLIO).remove([foto.ruta_storage]);
  return NextResponse.json({ ok: true });
}

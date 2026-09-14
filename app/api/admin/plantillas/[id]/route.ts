import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const campos: Record<string, unknown> = {};
  for (const clave of ["nombre", "nombre_meta", "idioma", "variables", "activa"]) {
    if (clave in body) campos[clave] = body[clave];
  }
  const supabase = createAdminClient();
  const { data: plantilla, error } = await supabase
    .from("plantillas_whatsapp")
    .update(campos)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 400 });
  return NextResponse.json({ plantilla });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("plantillas_whatsapp").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo eliminar (puede que ya esté usada en una campaña)." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

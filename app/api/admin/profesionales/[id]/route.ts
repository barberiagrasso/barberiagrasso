import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Igual que en servicios: no hay DELETE. Un profesional con citas ya
// creadas no se puede borrar (la base de datos lo impide), así que se
// desactiva en su lugar y deja de ofrecerse como opción nueva.
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
  if ("nombre" in body) campos.nombre = body.nombre;
  if ("activo" in body) campos.activo = body.activo;
  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "No hay campos que actualizar." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: profesional, error } = await supabase
    .from("profesionales")
    .update(campos)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const mensaje = error.code === "23505" ? "Ya existe un profesional con ese nombre." : "No se pudo actualizar.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  return NextResponse.json({ profesional });
}

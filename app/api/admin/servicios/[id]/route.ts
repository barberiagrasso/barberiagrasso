import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Actualiza cualquier combinación de campos de un servicio. No hay DELETE
// a propósito: un servicio puede estar referenciado por citas antiguas,
// así que en vez de borrarlo se desactiva (activo: false) y deja de
// ofrecerse en la reserva, pero el historial se mantiene intacto.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });

  const campos: Record<string, unknown> = {};
  for (const clave of ["nombre", "descripcion", "duracion_minutos", "precio_centimos", "categoria", "orden", "activo", "color", "precio_variable"]) {
    if (clave in body) campos[clave] = body[clave];
  }
  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "No hay campos que actualizar." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: servicio, error } = await supabase
    .from("servicios")
    .update(campos)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const mensaje = error.code === "23505" ? "Ya existe un servicio con ese nombre." : "No se pudo actualizar el servicio.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  return NextResponse.json({ servicio });
}

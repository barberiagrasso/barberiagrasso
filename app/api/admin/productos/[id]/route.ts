import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Actualiza cualquier combinación de campos de un producto. No hay
// DELETE a propósito: un producto puede estar referenciado por citas ya
// cerradas (cita_productos), así que en vez de borrarlo se desactiva
// (activo: false) y deja de aparecer en el selector del barbero, pero el
// histórico de ventas se mantiene intacto.
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
  for (const clave of ["nombre", "categoria", "precio_centimos", "orden", "activo"]) {
    if (clave in body) campos[clave] = body[clave];
  }
  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "No hay campos que actualizar." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: producto, error } = await supabase
    .from("productos")
    .update(campos)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar el producto." }, { status: 400 });
  }
  return NextResponse.json({ producto });
}

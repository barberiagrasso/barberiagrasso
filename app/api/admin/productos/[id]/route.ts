import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Actualiza cualquier combinación de campos de un producto. No hay
// DELETE a propósito: un producto puede estar referenciado por citas ya
// cerradas (cita_productos), así que en vez de borrarlo se desactiva
// (activo: false) y deja de aparecer en el selector del barbero, pero el
// histórico de ventas se mantiene intacto.
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
  for (const clave of ["nombre", "categoria", "precio_centimos", "orden", "activo", "stock", "stock_minimo"]) {
    if (clave in body) campos[clave] = body[clave];
  }
  // Merch / tienda de la app y GrassoCoins (27/10/2026).
  if ("visible_en_app" in body) campos.visible_en_app = Boolean(body.visible_en_app);
  if ("descripcion" in body) {
    campos.descripcion = typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 300) || null : null;
  }
  if ("coste_grassocoins" in body) {
    const coste = body.coste_grassocoins;
    if (coste !== null && !(Number.isInteger(coste) && coste > 0)) {
      return NextResponse.json({ error: "El precio en GrassoCoins tiene que ser un número entero mayor que 0 (o vacío)." }, { status: 400 });
    }
    campos.coste_grassocoins = coste;
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

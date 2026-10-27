import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_PORTAFOLIO } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

const TAMANO_MAXIMO_BYTES = 3 * 1024 * 1024;

/**
 * Foto de un producto o merch para la tienda de la app (/tienda). Llega
 * ya reducida desde el navegador. Se guarda en el mismo bucket público del
 * portafolio, en la carpeta productos/. Solo rol "admin".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.imagenBase64 !== "string") return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  const buffer = Buffer.from(body.imagenBase64, "base64");
  if (buffer.length === 0 || buffer.length > TAMANO_MAXIMO_BYTES) {
    return NextResponse.json({ error: "La foto pesa demasiado." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ruta = `productos/${id}-${Date.now()}.jpg`;
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_PORTAFOLIO)
    .upload(ruta, buffer, { contentType: "image/jpeg", upsert: false });
  if (errorSubida) {
    return NextResponse.json({ error: "No se pudo subir la foto." }, { status: 500 });
  }
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_PORTAFOLIO).getPublicUrl(ruta);

  const { data: producto, error } = await supabase
    .from("productos")
    .update({ foto_url: publicUrl })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !producto) return NextResponse.json({ error: "No se pudo guardar la foto." }, { status: 500 });
  return NextResponse.json({ producto });
}

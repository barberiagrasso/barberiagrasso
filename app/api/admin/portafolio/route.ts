import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_PORTAFOLIO } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
// Las fotos ya llegan reducidas desde el navegador (ver PortafolioClient),
// así que con 3 MB sobra y se queda lejos del límite de tamaño de
// petición de Vercel.
const TAMANO_MAXIMO_BYTES = 3 * 1024 * 1024;

/**
 * Sube UNA foto al portafolio (el panel manda las fotos de una en una para
 * no pasarse del tamaño máximo de petición). Solo rol "admin": Diego
 * decidió que los barberos no suben fotos (27/10/2026).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const imagenBase64 = body?.imagenBase64;
  const tipoMime = body?.tipoMime;
  if (typeof imagenBase64 !== "string" || typeof tipoMime !== "string") {
    return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  }
  const extension = TIPOS_PERMITIDOS[tipoMime];
  if (!extension) {
    return NextResponse.json({ error: "Formato no admitido (usa JPG, PNG o WEBP)." }, { status: 400 });
  }
  const buffer = Buffer.from(imagenBase64, "base64");
  if (buffer.length === 0 || buffer.length > TAMANO_MAXIMO_BYTES) {
    return NextResponse.json({ error: "La foto pesa demasiado." }, { status: 400 });
  }

  const servicioId = typeof body?.servicioId === "string" && body.servicioId ? body.servicioId : null;
  const sedeId = typeof body?.sedeId === "string" && body.sedeId ? body.sedeId : null;
  const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim().slice(0, 200) || null : null;

  const supabase = createAdminClient();
  const ruta = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_PORTAFOLIO)
    .upload(ruta, buffer, { contentType: tipoMime, upsert: false });
  if (errorSubida) {
    return NextResponse.json(
      { error: "No se pudo subir la foto. ¿Has ejecutado el script del portafolio en Supabase?" },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_PORTAFOLIO).getPublicUrl(ruta);

  const { data: foto, error } = await supabase
    .from("portafolio_fotos")
    .insert({ url: publicUrl, ruta_storage: ruta, servicio_id: servicioId, sede_id: sedeId, descripcion })
    .select("id, url, servicio_id, sede_id, descripcion, created_at")
    .single();
  if (error || !foto) {
    // No dejar el archivo huérfano si no se pudo apuntar en la tabla.
    await supabase.storage.from(BUCKET_PORTAFOLIO).remove([ruta]);
    return NextResponse.json({ error: "No se pudo guardar la foto." }, { status: 500 });
  }
  return NextResponse.json({ foto });
}

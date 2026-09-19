import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

/**
 * Deja que un barbero (o un admin con ficha de profesional vinculada) suba
 * su propia foto de perfil desde /admin/mi-perfil — pedido de Diego
 * (19/09/2026). Igual que /api/perfil, la imagen llega como base64 en el
 * body JSON (patrón ya usado en este proyecto, ver lib/wallet/appleWallet.ts)
 * en vez de multipart. Usa el cliente de servicio porque la subida a
 * Storage y la actualización de `profesionales` se hacen en nombre del
 * propio usuario, ya autenticado y comprobado aquí — no hay política de
 * self-write en `profesionales` ni en el bucket para no complicar RLS con
 * un caso que solo pasa por esta ruta.
 */
export async function POST(request: NextRequest) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  if (!admin.profesional_id) {
    return NextResponse.json({ error: "Tu cuenta no está vinculada a ninguna ficha de barbero." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const imagenBase64 = body?.imagenBase64;
  const tipoMime = body?.tipoMime;
  if (typeof imagenBase64 !== "string" || typeof tipoMime !== "string") {
    return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  }
  const extension = TIPOS_PERMITIDOS[tipoMime];
  if (!extension) {
    return NextResponse.json({ error: "Formato de imagen no admitido (usa JPG, PNG o WEBP)." }, { status: 400 });
  }

  const buffer = Buffer.from(imagenBase64, "base64");
  if (buffer.length === 0 || buffer.length > TAMANO_MAXIMO_BYTES) {
    return NextResponse.json({ error: "La imagen pesa demasiado (máximo 5 MB)." }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Nombre de archivo nuevo en cada subida (con timestamp) para que el
  // cambio de foto se note al instante, sin depender de invalidar caché.
  const ruta = `${admin.profesional_id}/${Date.now()}.${extension}`;
  const { error: errorSubida } = await supabase.storage
    .from("fotos-profesionales")
    .upload(ruta, buffer, { contentType: tipoMime, upsert: true });
  if (errorSubida) {
    return NextResponse.json({ error: "No se pudo subir la imagen. Inténtalo de nuevo." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("fotos-profesionales").getPublicUrl(ruta);

  const { error: errorGuardado } = await supabase
    .from("profesionales")
    .update({ foto_url: publicUrl })
    .eq("id", admin.profesional_id);
  if (errorGuardado) {
    return NextResponse.json({ error: "No se pudo guardar la foto. Inténtalo de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ fotoUrl: publicUrl });
}

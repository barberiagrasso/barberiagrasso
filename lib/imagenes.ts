// Reducir fotos en el navegador antes de subirlas (portafolio, merch...):
// una foto del móvil de varios MB queda en unos cientos de KB, sube rápido
// aunque haya poca cobertura y no se pasa del tamaño máximo de petición.
// Solo se puede usar en componentes "use client".

const LADO_MAXIMO_PX = 1600;
const CALIDAD_JPEG = 0.85;

/** Devuelve la foto reducida como JPEG en base64 (sin el prefijo "data:"). */
export async function reducirFoto(archivo: File, ladoMaximo = LADO_MAXIMO_PX): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no permite preparar la foto.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", CALIDAD_JPEG).split(",")[1] ?? "";
}

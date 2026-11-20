import "server-only";

// Probador virtual: con la foto del cliente, la IA de imágenes de Google
// (Gemini "Nano Banana 2") genera una foto suya con el corte o la barba
// elegidos. Solo lo usan los barberos desde el panel. Se activa poniendo
// GEMINI_API_KEY en Vercel; sin ella, la pantalla lo avisa y todo lo
// demás funciona igual. La foto no se guarda.

const MODELO = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

export class ProbadorNoActivoError extends Error {}

export function probadorActivo(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function probarEstilo(params: { imagenBase64: string; estilo: string; barba?: string | null; detalles?: string | null }): Promise<string> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new ProbadorNoActivoError("El probador con IA no está activado.");

  const instruccion = [
    "Edit this photo of a man at a barbershop to show him with a new haircut.",
    `New haircut: ${params.estilo}.`,
    params.barba ? `Beard: ${params.barba}.` : "Keep his beard exactly as it is.",
    params.detalles ? `Extra details: ${params.detalles}.` : "",
    "Keep his face, identity, skin, expression, age, clothes, pose, background and lighting exactly the same. Only change the hair (and the beard if asked).",
    "Photorealistic, natural barbershop result, professional and clean cut.",
  ]
    .filter(Boolean)
    .join(" ");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instruccion }, { inline_data: { mime_type: "image/jpeg", data: params.imagenBase64 } }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { thought?: boolean; inline_data?: { data?: string }; inlineData?: { data?: string } }[] } }[];
    error?: { message?: string };
  } | null;
  if (!res.ok) throw new Error(json?.error?.message || `La IA de imágenes respondió ${res.status}`);

  for (const parte of json?.candidates?.[0]?.content?.parts ?? []) {
    if (parte.thought) continue;
    const datos = parte.inline_data?.data ?? parte.inlineData?.data;
    if (datos) return datos;
  }
  throw new Error("La IA no devolvió ninguna imagen (puede que haya rechazado la foto).");
}

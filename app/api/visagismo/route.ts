import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";
import { recomendarEstilo, type PreferenciasEstilo } from "@/lib/visagismo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Asesor de estilo con IA. Público (no hace falta cuenta). La foto llega,
// se manda a la IA y se descarta: no se guarda ni se registra en ningún
// sitio (ni en los errores).
const TAMANO_MAXIMO = 4_000_000; // caracteres base64 (~3 MB)

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const imagen = typeof body?.imagenBase64 === "string" ? body.imagenBase64 : "";
  if (!body?.consentimiento) return NextResponse.json({ error: "Tienes que aceptar el uso de la foto para el análisis." }, { status: 400 });
  if (!imagen || imagen.length > TAMANO_MAXIMO || !/^[A-Za-z0-9+/=]+$/.test(imagen.slice(0, 200))) {
    return NextResponse.json({ error: "La foto no es válida. Prueba con otra." }, { status: 400 });
  }

  // Cada análisis cuesta dinero de IA: límite por persona.
  const limite = await comprobarLimite(`visagismo:ip:${ipDePeticion(request)}`, { maxIntentos: 6, ventanaMinutos: 60 * 24 });
  if (!limite.permitido) return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });

  const preferencias: PreferenciasEstilo = {
    estilo: ["clasico", "moderno", "comodo", "atrevido"].includes(body.estilo) ? body.estilo : null,
    barba: ["si", "no", "quiero_probar"].includes(body.barba) ? body.barba : null,
  };

  const { data: servicios } = await createPublicClient().from("servicios").select("id, nombre").eq("activo", true).order("orden");

  try {
    const resultado = await recomendarEstilo(imagen, preferencias, servicios ?? []);
    const nombres = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
    return NextResponse.json({
      ...resultado,
      servicios: resultado.servicioIds.map((id) => ({ id, nombre: nombres.get(id) ?? "" })),
    });
  } catch (err) {
    await registrarError({ origen: "asesor_estilo", mensaje: "Falló el asesor de estilo con IA.", detalle: err instanceof Error ? err.message : "error" });
    return NextResponse.json({ error: "No he podido analizar la foto ahora mismo. Inténtalo en un momento." }, { status: 502 });
  }
}

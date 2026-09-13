import { NextRequest, NextResponse } from "next/server";
import { registrarError } from "@/lib/errorLog";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Recibe los errores de render que capturan app/global-error.tsx y
// app/admin/(protected)/error.tsx (errores del navegador del cliente, que
// nunca pasan por instrumentation.ts porque ese solo ve errores del
// servidor). Sin autenticación porque se dispara desde /reservar, una
// página pública — protegido igualmente con el mismo límite de intentos
// que ya usa la reserva, para que no sirva para hacer spam.
export async function POST(request: NextRequest) {
  const { permitido } = await comprobarLimite(`error-cliente:ip:${ipDePeticion(request)}`, {
    maxIntentos: 10,
    ventanaMinutos: 60,
  });
  if (!permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const mensaje = typeof body?.mensaje === "string" ? body.mensaje : "Error de render sin mensaje";

  await registrarError({
    origen: "servidor",
    mensaje: `[navegador] ${mensaje}`,
    detalle: { pagina: typeof body?.pagina === "string" ? body.pagina : undefined, digest: body?.digest },
  });

  return NextResponse.json({ ok: true });
}

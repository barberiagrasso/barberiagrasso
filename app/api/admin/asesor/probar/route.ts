import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { comprobarLimite } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";
import { probarEstilo, probadorActivo, ProbadorNoActivoError } from "@/lib/probadorIA";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Probador virtual para el equipo (tablet o móvil del barbero).
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  return NextResponse.json({ activo: probadorActivo() });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  const imagen = typeof body?.imagenBase64 === "string" ? body.imagenBase64 : "";
  const estilo = typeof body?.estilo === "string" ? body.estilo.trim().slice(0, 120) : "";
  if (!body?.consentimiento) return NextResponse.json({ error: "Confirma que el cliente acepta usar su foto con la IA." }, { status: 400 });
  if (!imagen || imagen.length > 4_000_000 || !estilo) return NextResponse.json({ error: "Falta la foto o el estilo." }, { status: 400 });

  // Tope de gasto: 60 pruebas al día por cuenta del equipo.
  const limite = await comprobarLimite(`probador:${admin.id}`, { maxIntentos: 60, ventanaMinutos: 60 * 24 });
  if (!limite.permitido) return NextResponse.json({ error: "Has llegado al límite de pruebas de hoy." }, { status: 429 });

  try {
    const resultado = await probarEstilo({
      imagenBase64: imagen,
      estilo,
      barba: typeof body.barba === "string" ? body.barba.slice(0, 80) : null,
      detalles: typeof body.detalles === "string" ? body.detalles.slice(0, 200) : null,
    });
    return NextResponse.json({ imagenBase64: resultado });
  } catch (err) {
    if (err instanceof ProbadorNoActivoError) return NextResponse.json({ error: err.message, noActivo: true }, { status: 503 });
    await registrarError({ origen: "asesor_estilo", mensaje: "Falló el probador de estilos con IA.", detalle: err instanceof Error ? err.message : "error" });
    return NextResponse.json({ error: "La IA no ha podido generar la foto. Prueba otra vez o con otra foto." }, { status: 502 });
  }
}

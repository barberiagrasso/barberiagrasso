import { NextRequest, NextResponse } from "next/server";
import { buscarProximoDiaConHueco } from "@/lib/availability";

export const dynamic = "force-dynamic";

// Botón "Próximos espacios" del paso de fecha de app/reservar: dado un
// día sin huecos, busca el primer día posterior con al menos uno.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const servicioId = params.get("servicioId");
  const desde = params.get("desde");
  const profesionalId = params.get("profesionalId") || undefined;
  const duracionExtraMinutos = Number(params.get("duracionExtraMinutos") || 0) || 0;

  if (!sedeId || !servicioId || !desde) {
    return NextResponse.json(
      { error: "Faltan parámetros: sedeId, servicioId y desde son obligatorios." },
      { status: 400 }
    );
  }

  try {
    const resultado = await buscarProximoDiaConHueco({ sedeId, servicioId, profesionalId, desde, duracionExtraMinutos });
    if (!resultado) {
      return NextResponse.json(
        { error: "No encontramos ningún hueco en los próximos meses. Prueba con otro barbero o llámanos." },
        { status: 404 }
      );
    }
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("Error buscando el próximo hueco disponible", err);
    return NextResponse.json({ error: "No se pudo buscar el próximo hueco disponible." }, { status: 500 });
  }
}

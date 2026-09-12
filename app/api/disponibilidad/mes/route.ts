import { NextRequest, NextResponse } from "next/server";
import { getMonthAvailabilitySummary } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const servicioId = params.get("servicioId");
  const anio = Number(params.get("anio"));
  const mes = Number(params.get("mes"));
  const profesionalId = params.get("profesionalId") || undefined;
  const duracionExtraMinutos = Number(params.get("duracionExtraMinutos") || 0) || 0;

  if (!sedeId || !servicioId || !anio || !mes || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "Faltan parámetros: sedeId, servicioId, anio y mes (1-12) son obligatorios." },
      { status: 400 }
    );
  }

  try {
    const dias = await getMonthAvailabilitySummary({
      sedeId,
      servicioId,
      profesionalId,
      anio,
      mes,
      duracionExtraMinutos,
    });
    return NextResponse.json({ dias });
  } catch (err) {
    console.error("Error calculando resumen mensual de disponibilidad", err);
    return NextResponse.json({ error: "No se pudo calcular la disponibilidad del mes." }, { status: 500 });
  }
}

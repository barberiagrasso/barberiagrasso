import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const servicioId = params.get("servicioId");
  const fecha = params.get("fecha");
  const profesionalId = params.get("profesionalId") || undefined;
  const duracionExtraMinutos = Number(params.get("duracionExtraMinutos") || 0) || 0;

  if (!sedeId || !servicioId || !fecha) {
    return NextResponse.json(
      { error: "Faltan parámetros: sedeId, servicioId y fecha son obligatorios." },
      { status: 400 }
    );
  }

  try {
    const slots = await getAvailableSlots({
      sedeId,
      servicioId,
      fecha,
      profesionalId,
      duracionExtraMinutos,
    });
    return NextResponse.json({ slots });
  } catch (err) {
    console.error("Error calculando disponibilidad", err);
    return NextResponse.json({ error: "No se pudo calcular la disponibilidad." }, { status: 500 });
  }
}

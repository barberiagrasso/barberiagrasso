import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { cargarFotosPortafolio } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

// Fotos del portafolio (públicas). Con ?servicioId= solo las de ese
// servicio — lo usa el botón "Ver trabajos" de cada servicio al reservar.
export async function GET(request: NextRequest) {
  const servicioId = request.nextUrl.searchParams.get("servicioId");
  const fotos = await cargarFotosPortafolio(createPublicClient(), { servicioId, limite: 60 });
  return NextResponse.json({ fotos });
}

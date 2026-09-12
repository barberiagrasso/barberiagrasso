import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lista pública de profesionales que trabajan en una sede y realizan un
// servicio concreto. Se usa en el paso "elige profesional (opcional)"
// del flujo de reserva.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const servicioId = params.get("servicioId");

  if (!sedeId || !servicioId) {
    return NextResponse.json({ error: "Faltan sedeId y servicioId." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: sedeProfesionales } = await supabase
    .from("profesional_sedes")
    .select("profesional_id, profesionales!inner(id, nombre, activo)")
    .eq("sede_id", sedeId)
    .eq("profesionales.activo", true);

  const { data: profesionalServicios } = await supabase
    .from("profesional_servicios")
    .select("profesional_id")
    .eq("servicio_id", servicioId);

  const idsConServicio = new Set((profesionalServicios ?? []).map((p) => p.profesional_id));

  const profesionales = (sedeProfesionales ?? [])
    .filter((sp) => idsConServicio.has(sp.profesional_id))
    .map((sp) => {
      const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
      return { id: sp.profesional_id, nombre: (prof as { nombre: string })?.nombre ?? "" };
    });

  return NextResponse.json({ profesionales });
}

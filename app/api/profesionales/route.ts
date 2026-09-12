import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lista pública de profesionales que trabajan en una sede y realizan un
// servicio concreto. Se usa en el paso "elige profesional (opcional)"
// del flujo de reserva.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const servicioId = params.get("servicioId"); // opcional: si no se pasa, no filtra por servicio

  if (!sedeId) {
    return NextResponse.json({ error: "Falta sedeId." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: sedeProfesionales } = await supabase
    .from("profesional_sedes")
    .select("profesional_id, profesionales!inner(id, nombre, activo)")
    .eq("sede_id", sedeId)
    .eq("profesionales.activo", true);

  let idsConServicio: Set<string> | null = null;
  if (servicioId) {
    const { data: profesionalServicios } = await supabase
      .from("profesional_servicios")
      .select("profesional_id")
      .eq("servicio_id", servicioId);
    idsConServicio = new Set((profesionalServicios ?? []).map((p) => p.profesional_id));
  }

  const profesionales = (sedeProfesionales ?? [])
    .filter((sp) => !idsConServicio || idsConServicio.has(sp.profesional_id))
    .map((sp) => {
      const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
      return { id: sp.profesional_id, nombre: (prof as { nombre: string })?.nombre ?? "" };
    });

  return NextResponse.json({ profesionales });
}

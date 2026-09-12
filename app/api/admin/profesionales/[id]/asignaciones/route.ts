import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Reemplaza de golpe a qué sedes y a qué servicios está asignado un
// profesional (las checkboxes del panel mandan la lista completa de ids
// marcados, no un cambio incremental). Sencillo de razonar y evita tener
// que ir fila a fila.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const sedeIds: string[] = Array.isArray(body?.sedeIds) ? body.sedeIds : [];
  const servicioIds: string[] = Array.isArray(body?.servicioIds) ? body.servicioIds : [];

  const supabase = createAdminClient();

  const { error: errorBorrarSedes } = await supabase.from("profesional_sedes").delete().eq("profesional_id", id);
  const { error: errorBorrarServicios } = await supabase
    .from("profesional_servicios")
    .delete()
    .eq("profesional_id", id);
  if (errorBorrarSedes || errorBorrarServicios) {
    return NextResponse.json({ error: "No se pudieron actualizar las asignaciones." }, { status: 500 });
  }

  if (sedeIds.length > 0) {
    const { error } = await supabase
      .from("profesional_sedes")
      .insert(sedeIds.map((sedeId) => ({ profesional_id: id, sede_id: sedeId })));
    if (error) return NextResponse.json({ error: "No se pudieron guardar las sedes." }, { status: 500 });
  }
  if (servicioIds.length > 0) {
    const { error } = await supabase
      .from("profesional_servicios")
      .insert(servicioIds.map((servicioId) => ({ profesional_id: id, servicio_id: servicioId })));
    if (error) return NextResponse.json({ error: "No se pudieron guardar los servicios." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

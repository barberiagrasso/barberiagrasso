import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lista todos los profesionales (activos e inactivos) junto con las
// sedes y servicios a los que ya están asignados, para pintar el panel
// de un solo golpe sin ida y vuelta por cada fila.
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const [{ data: profesionales }, { data: sedesVinculo }, { data: serviciosVinculo }] = await Promise.all([
    supabase.from("profesionales").select("*").order("nombre"),
    supabase.from("profesional_sedes").select("profesional_id, sede_id"),
    supabase.from("profesional_servicios").select("profesional_id, servicio_id"),
  ]);

  const conAsignaciones = (profesionales ?? []).map((p) => ({
    ...p,
    sede_ids: (sedesVinculo ?? []).filter((v) => v.profesional_id === p.id).map((v) => v.sede_id),
    servicio_ids: (serviciosVinculo ?? []).filter((v) => v.profesional_id === p.id).map((v) => v.servicio_id),
  }));

  return NextResponse.json({ profesionales: conAsignaciones });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body?.nombre) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: profesional, error } = await supabase
    .from("profesionales")
    .insert({ nombre: body.nombre, activo: true })
    .select("*")
    .single();

  if (error) {
    const mensaje = error.code === "23505" ? "Ya existe un profesional con ese nombre." : "No se pudo crear el profesional.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  return NextResponse.json({ profesional: { ...profesional, sede_ids: [], servicio_ids: [] } });
}

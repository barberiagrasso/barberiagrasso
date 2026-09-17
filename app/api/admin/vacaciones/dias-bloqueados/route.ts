import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Días (o periodos) en los que el admin impide pedir vacaciones — p. ej.
// Navidad. Cualquier cuenta de equipo puede verlos (los necesita el
// calendario del barbero para saber qué no puede pedir).
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data: dias, error } = await supabase
    .from("dias_bloqueados_vacaciones")
    .select("id, fecha_inicio, fecha_fin, motivo")
    .order("fecha_inicio");
  if (error) return NextResponse.json({ error: "No se pudieron cargar los días bloqueados." }, { status: 500 });
  return NextResponse.json({ dias });
}

// Solo el rol "admin" puede bloquear fechas.
export async function POST(request: NextRequest) {
  let sesion;
  try {
    sesion = await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { admin } = sesion;

  const body = await request.json().catch(() => null);
  if (!body?.fechaInicio || !body?.fechaFin) {
    return NextResponse.json({ error: "Faltan las fechas de inicio y fin." }, { status: 400 });
  }
  if (body.fechaFin < body.fechaInicio) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: dia, error } = await supabase
    .from("dias_bloqueados_vacaciones")
    .insert({ fecha_inicio: body.fechaInicio, fecha_fin: body.fechaFin, motivo: body.motivo || null, creado_por: admin.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "No se pudo bloquear ese periodo." }, { status: 500 });
  return NextResponse.json({ dia });
}

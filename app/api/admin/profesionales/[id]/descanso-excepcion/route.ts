import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Mueve el descanso para comer de un barbero UN DÍA CONCRETO (arrastrado
// en la Agenda), sin tocar su regla general de horarios. Solo el rol
// "admin" puede hacerlo (Diego, 17/09/2026: "solo podrá hacerlo el
// administrador desde la agenda, arrastrándola").
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.sedeId || !body?.fecha || !body?.horaInicio || !body?.horaFin) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  if (body.horaFin <= body.horaInicio) {
    return NextResponse.json({ error: "La hora de fin debe ser mayor que la de inicio." }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Un upsert manual (borrar + insertar) porque la clave de conflicto es
  // compuesta (profesional_id, fecha) y así queda igual de simple que el
  // resto de "reemplazar entero" que ya usa este proyecto (horarios).
  await supabase.from("descansos_excepciones").delete().eq("profesional_id", id).eq("fecha", body.fecha);
  const { data: excepcion, error } = await supabase
    .from("descansos_excepciones")
    .insert({
      profesional_id: id,
      sede_id: body.sedeId,
      fecha: body.fecha,
      hora_inicio: body.horaInicio,
      hora_fin: body.horaFin,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "No se pudo mover el descanso." }, { status: 500 });
  return NextResponse.json({ excepcion });
}

// Deshace el cambio puntual de ese día: vuelve a la regla general.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const fecha = request.nextUrl.searchParams.get("fecha");
  if (!fecha) return NextResponse.json({ error: "Falta la fecha." }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("descansos_excepciones").delete().eq("profesional_id", id).eq("fecha", fecha);
  if (error) return NextResponse.json({ error: "No se pudo deshacer el cambio." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

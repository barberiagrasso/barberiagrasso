import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Horario semanal recurrente de un profesional en una sede concreta
// (dia_semana 0=domingo..6=sábado). GET para cargar lo que ya tiene, PUT
// para reemplazarlo entero (más simple que ir turno a turno).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const sedeId = request.nextUrl.searchParams.get("sedeId");
  if (!sedeId) return NextResponse.json({ error: "Falta sedeId." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: horarios, error } = await supabase
    .from("horarios")
    .select("*")
    .eq("profesional_id", id)
    .eq("sede_id", sedeId)
    .order("dia_semana");

  if (error) return NextResponse.json({ error: "No se pudo cargar el horario." }, { status: 500 });
  return NextResponse.json({ horarios });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const sedeId = body?.sedeId as string | undefined;
  const turnos = Array.isArray(body?.horarios) ? body.horarios : [];
  if (!sedeId) return NextResponse.json({ error: "Falta sedeId." }, { status: 400 });

  for (const t of turnos) {
    const tieneDescanso = Boolean(t.descanso_inicio || t.descanso_fin);
    if (
      typeof t.dia_semana !== "number" ||
      t.dia_semana < 0 ||
      t.dia_semana > 6 ||
      !t.hora_inicio ||
      !t.hora_fin ||
      t.hora_fin <= t.hora_inicio
    ) {
      return NextResponse.json({ error: "Algún turno tiene datos inválidos (hora fin debe ser mayor que hora inicio)." }, { status: 400 });
    }
    if (
      tieneDescanso &&
      (!t.descanso_inicio ||
        !t.descanso_fin ||
        t.descanso_fin <= t.descanso_inicio ||
        t.descanso_inicio < t.hora_inicio ||
        t.descanso_fin > t.hora_fin)
    ) {
      return NextResponse.json(
        { error: "El descanso debe tener hora de inicio y fin, y caer dentro del turno de ese día." },
        { status: 400 }
      );
    }
  }

  const supabase = createAdminClient();
  const { error: errorBorrar } = await supabase
    .from("horarios")
    .delete()
    .eq("profesional_id", id)
    .eq("sede_id", sedeId);
  if (errorBorrar) return NextResponse.json({ error: "No se pudo actualizar el horario." }, { status: 500 });

  if (turnos.length > 0) {
    const { error } = await supabase.from("horarios").insert(
      turnos.map((t: { dia_semana: number; hora_inicio: string; hora_fin: string; descanso_inicio?: string | null; descanso_fin?: string | null }) => ({
        profesional_id: id,
        sede_id: sedeId,
        dia_semana: t.dia_semana,
        hora_inicio: t.hora_inicio,
        hora_fin: t.hora_fin,
        descanso_inicio: t.descanso_inicio || null,
        descanso_fin: t.descanso_fin || null,
      }))
    );
    if (error) return NextResponse.json({ error: "No se pudo guardar el horario." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

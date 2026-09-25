import { NextRequest, NextResponse } from "next/server";
import { parse } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaEnMadrid } from "@/lib/horarioLocal";

export const dynamic = "force-dynamic";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();

  // Una cuenta de equipo (rol "barbero") solo puede borrar sus propios
  // bloqueos, nunca los de otro compañero ni uno de "toda la sede"
  // (pedido de Diego, 25/09/2026 — no debe poder tocar las vacaciones de
  // los demás).
  const { data: actual } = await supabase.from("bloqueos").select("profesional_id").eq("id", id).maybeSingle();
  if (!actual) return NextResponse.json({ error: "Bloqueo no encontrado." }, { status: 404 });
  if (admin.rol !== "admin" && actual.profesional_id !== admin.profesional_id) {
    return NextResponse.json({ error: "No puedes eliminar el bloqueo de otro profesional." }, { status: 403 });
  }

  const { error } = await supabase.from("bloqueos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo eliminar el bloqueo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Corrige las horas exactas de un bloqueo de franja horaria ya creado
// (el que se crea arrastrando en la Agenda, ver POST en
// app/api/admin/bloqueos/route.ts) — el rectángulo arrastrado es solo un
// punto de partida (30 min por defecto), esto deja ajustarlo después a
// lo que haga falta. Mantiene el mismo día del bloqueo original: solo
// cambian las horas dentro de ese día, nunca cruza a otro.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const horaInicio = typeof body?.horaInicio === "string" ? body.horaInicio : "";
  const horaFin = typeof body?.horaFin === "string" ? body.horaFin : "";
  const motivo = typeof body?.motivo === "string" ? body.motivo : null;
  if (!horaInicio || !horaFin) {
    return NextResponse.json({ error: "Faltan horaInicio y horaFin." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: actual } = await supabase
    .from("bloqueos")
    .select("id, fecha_inicio, profesional_id")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return NextResponse.json({ error: "Bloqueo no encontrado." }, { status: 404 });
  if (!actual.profesional_id) {
    // Un bloqueo de "toda la sede" (día completo, festivo/cierre) no se
    // edita por horas desde aquí — esos se gestionan por día entero desde
    // la pantalla de Bloqueos.
    return NextResponse.json({ error: "Este bloqueo no se puede editar por horas." }, { status: 400 });
  }
  // Una cuenta de equipo solo puede editar sus propios bloqueos, nunca los
  // de otro barbero (pedido de Diego, 25/09/2026).
  if (admin.rol !== "admin" && actual.profesional_id !== admin.profesional_id) {
    return NextResponse.json({ error: "No puedes editar el bloqueo de otro profesional." }, { status: 403 });
  }

  const fecha = fechaEnMadrid(actual.fecha_inicio);
  const inicioLocal = parse(`${fecha} ${horaInicio}`, "yyyy-MM-dd HH:mm", new Date());
  const finLocal = parse(`${fecha} ${horaFin}`, "yyyy-MM-dd HH:mm", new Date());
  const fechaInicio = fromZonedTime(inicioLocal, TZ);
  const fechaFin = fromZonedTime(finLocal, TZ);
  if (fechaFin <= fechaInicio) {
    return NextResponse.json({ error: "La hora de fin debe ser posterior a la de inicio." }, { status: 400 });
  }

  const { error } = await supabase
    .from("bloqueos")
    .update({
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
      motivo,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo guardar el bloqueo." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

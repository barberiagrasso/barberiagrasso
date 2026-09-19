import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Destinos puntuales de un profesional: días sueltos en los que, en vez
// de trabajar en su sede habitual, se le destina a otra (caso real:
// Juan trabaja por defecto en Avenida de las Ciudades, pero algunos días
// puntuales se le destina a Los Molinos — ver supabase/anadir-destinos-puntuales.sql
// y lib/availability.ts). No toca ni sustituye ni las sedes/servicios
// permanentes (asignaciones) ni el horario semanal recurrente: es una
// excepción de un solo día, pensada para gestionarse en un momento y
// olvidarse — no hace falta "deshacerla" después de que pase el día.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: destinos, error } = await supabase
    .from("destinos_puntuales")
    .select("id, fecha, sede_id, hora_inicio, hora_fin, notas, sede:sedes(nombre)")
    .eq("profesional_id", id)
    .order("fecha", { ascending: true });

  if (error) return NextResponse.json({ error: "No se pudieron cargar los destinos puntuales." }, { status: 500 });
  return NextResponse.json({ destinos: destinos ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireRolAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const fecha = body?.fecha as string | undefined;
  const sedeId = body?.sedeId as string | undefined;
  const horaInicio = body?.horaInicio as string | undefined;
  const horaFin = body?.horaFin as string | undefined;
  const notas = typeof body?.notas === "string" && body.notas.trim() ? body.notas.trim() : null;

  if (!fecha || !sedeId || !horaInicio || !horaFin) {
    return NextResponse.json({ error: "Faltan datos: fecha, sede y horario son obligatorios." }, { status: 400 });
  }
  if (horaFin <= horaInicio) {
    return NextResponse.json({ error: "La hora de fin debe ser posterior a la de inicio." }, { status: 400 });
  }
  // No tiene sentido destinar a alguien puntualmente a una sede en un día
  // ya pasado — evita despistes al elegir mal el año.
  const hoy = new Date().toISOString().slice(0, 10);
  if (fecha < hoy) {
    return NextResponse.json({ error: "No se puede destinar a una fecha ya pasada." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: destino, error } = await supabase
    .from("destinos_puntuales")
    .insert({
      profesional_id: id,
      fecha,
      sede_id: sedeId,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      notas,
      creado_por: admin.id,
    })
    .select("id, fecha, sede_id, hora_inicio, hora_fin, notas, sede:sedes(nombre)")
    .single();

  if (error) {
    const mensaje =
      error.code === "23505"
        ? "Ya hay un destino puntual guardado para ese día. Bórralo primero si quieres cambiarlo."
        : "No se pudo guardar el destino puntual.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  return NextResponse.json({ destino });
}

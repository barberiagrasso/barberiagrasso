import { NextRequest, NextResponse } from "next/server";
import { startOfDay, endOfDay, parse } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { requireAdminApi, requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";

// Lista los bloqueos (vacaciones, días libres, cierres puntuales) de una
// sede, incluyendo los que afectan a toda la sede (profesional_id nulo).
// Solo rol "admin" (requireRolAdminApi): esta lista trae el motivo de
// TODOS los barberos de la sede a la vez, sin filtrar por quién pregunta
// — lo usa únicamente la pantalla de "Vacaciones y días libres", que ya
// es solo-admin (ver app/admin/(protected)/bloqueos/page.tsx). Un
// barbero viendo sus propios bloqueos en la Agenda no pasa por aquí (ver
// lib/agenda.ts).
export async function GET(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const sedeId = request.nextUrl.searchParams.get("sedeId");
  if (!sedeId)
    return NextResponse.json({ error: "Falta sedeId." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: bloqueos, error } = await supabase
    .from("bloqueos")
    .select(
      "id, profesional_id, fecha_inicio, fecha_fin, motivo, profesional:profesionales(nombre, foto_url)",
    )
    .eq("sede_id", sedeId)
    .gte("fecha_fin", new Date().toISOString())
    .order("fecha_inicio");

  if (error)
    return NextResponse.json(
      { error: "No se pudieron cargar los bloqueos." },
      { status: 500 },
    );
  return NextResponse.json({ bloqueos });
}

// Crea un bloqueo. `profesionalId: null` bloquea toda la sede (por
// ejemplo, un festivo). `fecha`/`fechaFin` son días completos en
// formato YYYY-MM-DD, en la hora local del negocio.
//
// Variante de franja horaria (usada por el arrastre de "Bloqueo de
// agenda" en la Agenda, ver CalendarioDia.tsx): si llegan `horaInicio` y
// `horaFin` ("HH:mm"), el bloqueo no cubre el día entero sino solo esa
// franja de `fecha` — siempre para un profesional concreto (bloquear
// unos minutos de "toda la sede" no tiene sentido, a diferencia del
// cierre de día completo). `fechaFin` se ignora en ese caso: la franja
// nunca cruza de un día a otro.
export async function POST(request: NextRequest) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError)
      return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const horaInicio =
    typeof body?.horaInicio === "string" ? body.horaInicio : null;
  const horaFin = typeof body?.horaFin === "string" ? body.horaFin : null;

  if (!body?.sedeId || !body?.fecha) {
    return NextResponse.json(
      { error: "Faltan sedeId y fecha." },
      { status: 400 },
    );
  }

  // Una cuenta de equipo (rol "barbero") puede crear un bloqueo arrastrando
  // en su propia Agenda, pero solo en su propia columna — nunca en la de
  // otro barbero ni "toda la sede" (eso sigue siendo cosa del admin desde
  // la pantalla de Bloqueos, ya restringida a ese rol).
  if (admin.rol !== "admin" && body.profesionalId !== admin.profesional_id) {
    return NextResponse.json(
      { error: "No puedes crear un bloqueo en la agenda de otro profesional." },
      { status: 403 },
    );
  }

  let fechaInicio: Date;
  let fechaFin: Date;

  if (horaInicio || horaFin) {
    if (!horaInicio || !horaFin) {
      return NextResponse.json(
        { error: "Faltan horaInicio y horaFin." },
        { status: 400 },
      );
    }
    if (!body.profesionalId) {
      return NextResponse.json(
        { error: "Un bloqueo con hora necesita un profesional concreto." },
        { status: 400 },
      );
    }
    const inicioLocal = parse(
      `${body.fecha} ${horaInicio}`,
      "yyyy-MM-dd HH:mm",
      new Date(),
    );
    const finLocal = parse(
      `${body.fecha} ${horaFin}`,
      "yyyy-MM-dd HH:mm",
      new Date(),
    );
    fechaInicio = fromZonedTime(inicioLocal, TZ);
    fechaFin = fromZonedTime(finLocal, TZ);
  } else {
    if (!body?.fechaFin) {
      return NextResponse.json(
        { error: "Faltan sedeId, fecha y fechaFin." },
        { status: 400 },
      );
    }
    const inicioLocal = startOfDay(parse(body.fecha, "yyyy-MM-dd", new Date()));
    const finLocal = endOfDay(parse(body.fechaFin, "yyyy-MM-dd", new Date()));
    fechaInicio = fromZonedTime(inicioLocal, TZ);
    fechaFin = fromZonedTime(finLocal, TZ);
  }

  if (fechaFin < fechaInicio) {
    return NextResponse.json(
      { error: "La fecha de fin no puede ser anterior a la de inicio." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: bloqueo, error } = await supabase
    .from("bloqueos")
    .insert({
      sede_id: body.sedeId,
      profesional_id: body.profesionalId || null,
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
      motivo: body.motivo || null,
    })
    .select("*")
    .single();

  if (error)
    return NextResponse.json(
      { error: "No se pudo crear el bloqueo." },
      { status: 500 },
    );
  return NextResponse.json({ bloqueo });
}

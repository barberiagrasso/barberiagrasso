import { NextRequest, NextResponse } from "next/server";
import { startOfDay, endOfDay, parse } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";

// Lista los bloqueos (vacaciones, días libres, cierres puntuales) de una
// sede, incluyendo los que afectan a toda la sede (profesional_id nulo).
export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const sedeId = request.nextUrl.searchParams.get("sedeId");
  if (!sedeId) return NextResponse.json({ error: "Falta sedeId." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: bloqueos, error } = await supabase
    .from("bloqueos")
    .select("id, profesional_id, fecha_inicio, fecha_fin, motivo, profesional:profesionales(nombre, foto_url)")
    .eq("sede_id", sedeId)
    .gte("fecha_fin", new Date().toISOString())
    .order("fecha_inicio");

  if (error) return NextResponse.json({ error: "No se pudieron cargar los bloqueos." }, { status: 500 });
  return NextResponse.json({ bloqueos });
}

// Crea un bloqueo. `profesionalId: null` bloquea toda la sede (por
// ejemplo, un festivo). `fecha`/`fechaFin` son días completos en
// formato YYYY-MM-DD, en la hora local del negocio.
export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body?.sedeId || !body?.fecha || !body?.fechaFin) {
    return NextResponse.json({ error: "Faltan sedeId, fecha y fechaFin." }, { status: 400 });
  }

  const inicioLocal = startOfDay(parse(body.fecha, "yyyy-MM-dd", new Date()));
  const finLocal = endOfDay(parse(body.fechaFin, "yyyy-MM-dd", new Date()));
  const fechaInicio = fromZonedTime(inicioLocal, TZ);
  const fechaFin = fromZonedTime(finLocal, TZ);

  if (fechaFin < fechaInicio) {
    return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la de inicio." }, { status: 400 });
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

  if (error) return NextResponse.json({ error: "No se pudo crear el bloqueo." }, { status: 500 });
  return NextResponse.json({ bloqueo });
}

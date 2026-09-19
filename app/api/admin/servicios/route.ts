import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { colorPorRotacion } from "@/lib/coloresServicio";

export const dynamic = "force-dynamic";

// Lista TODOS los servicios (activos e inactivos) para el panel — a
// diferencia de la reserva pública, que solo ve los activos.
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data: servicios, error } = await supabase
    .from("servicios")
    .select("*")
    .order("categoria", { nullsFirst: true })
    .order("orden");

  if (error) return NextResponse.json({ error: "No se pudieron cargar los servicios." }, { status: 500 });
  return NextResponse.json({ servicios });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body?.nombre || !body?.duracion_minutos || body?.precio_centimos === undefined) {
    return NextResponse.json({ error: "Faltan nombre, duración o precio." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Color por rotación de la paleta si no se especifica uno a mano —
  // así ningún servicio nuevo se queda sin color en la leyenda de la
  // Agenda. Se basa en cuántos servicios hay ya dados de alta (activos o
  // no) para que dos altas seguidas no elijan siempre el mismo color.
  let colorAsignado = body.color || null;
  if (!colorAsignado) {
    const { count } = await supabase.from("servicios").select("id", { count: "exact", head: true });
    colorAsignado = colorPorRotacion(count ?? 0);
  }

  const { data: servicio, error } = await supabase
    .from("servicios")
    .insert({
      nombre: body.nombre,
      descripcion: body.descripcion || null,
      duracion_minutos: body.duracion_minutos,
      precio_centimos: body.precio_centimos,
      categoria: body.categoria || null,
      orden: body.orden ?? 0,
      activo: body.activo ?? true,
      color: colorAsignado,
    })
    .select("*")
    .single();

  if (error) {
    const mensaje = error.code === "23505" ? "Ya existe un servicio con ese nombre." : "No se pudo crear el servicio.";
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
  return NextResponse.json({ servicio });
}

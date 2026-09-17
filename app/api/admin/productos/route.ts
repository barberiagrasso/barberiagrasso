import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lista TODOS los productos (activos e inactivos) para el panel — estos
// productos nunca se ven ni se pueden comprar desde la reserva online:
// solo existen para que un barbero los añada a una cita ya cerrada.
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data: productos, error } = await supabase
    .from("productos")
    .select("*")
    .order("categoria", { nullsFirst: true })
    .order("orden");

  if (error) return NextResponse.json({ error: "No se pudieron cargar los productos." }, { status: 500 });
  return NextResponse.json({ productos });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body?.nombre || body?.precio_centimos === undefined) {
    return NextResponse.json({ error: "Faltan nombre o precio." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: producto, error } = await supabase
    .from("productos")
    .insert({
      nombre: body.nombre,
      categoria: body.categoria || null,
      precio_centimos: body.precio_centimos,
      orden: body.orden ?? 0,
      activo: body.activo ?? true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "No se pudo crear el producto." }, { status: 400 });
  }
  return NextResponse.json({ producto });
}

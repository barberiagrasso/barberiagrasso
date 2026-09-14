import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Registro de plantillas de WhatsApp aprobadas por Meta. No las crea ni
// las manda a aprobar (eso se hace en Meta Business Manager); solo
// guarda el nombre exacto para poder usarlas desde recordatorios y
// campañas sin tocar código.
export async function GET() {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const supabase = createAdminClient();
  const { data: plantillas, error } = await supabase.from("plantillas_whatsapp").select("*").order("created_at");
  if (error) return NextResponse.json({ error: "No se pudieron cargar las plantillas." }, { status: 500 });
  return NextResponse.json({ plantillas });
}

export async function POST(request: NextRequest) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const body = await request.json().catch(() => null);
  if (!body?.tipo || !body?.nombre || !body?.nombre_meta) {
    return NextResponse.json({ error: "Faltan tipo, nombre y nombre_meta." }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data: plantilla, error } = await supabase
    .from("plantillas_whatsapp")
    .insert({
      tipo: body.tipo,
      nombre: body.nombre,
      nombre_meta: body.nombre_meta,
      idioma: body.idioma || "es",
      variables: Array.isArray(body.variables) ? body.variables : [],
      activa: true,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "No se pudo crear la plantilla." }, { status: 400 });
  return NextResponse.json({ plantilla });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Historial completo de citas de un cliente concreto — es lo que se ve
// al abrir la pestaña "+" de ese cliente en el CRM del panel.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: citas, error } = await supabase
    .from("citas")
    .select(
      "id, inicio, estado, origen, sede:sedes(nombre), servicio:servicios(nombre, precio_centimos), profesional:profesionales(nombre), extras:cita_extras(precio_centimos, servicio:servicios(nombre))"
    )
    .eq("cliente_id", id)
    .order("inicio", { ascending: false });

  if (error) return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });

  return NextResponse.json({ citas: citas ?? [] });
}

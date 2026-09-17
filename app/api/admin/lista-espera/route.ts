import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lista para la pestaña "Lista de espera" del panel (cualquier cuenta de
// equipo puede verla, igual que la Agenda o Clientes): las entradas que
// siguen esperando un hueco (o a las que ya se avisó pero, por lo que
// sea, nunca llegaron a "reservado") de una sede, para pintarlas
// agrupadas por día como una segunda agenda.
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
  const { data: entradas, error } = await supabase
    .from("lista_espera")
    .select(
      "id, fecha, flexibilidad_dias, estado, created_at, cliente:clientes(nombre, telefono), servicio:servicios(nombre), profesional:profesionales(nombre)"
    )
    .eq("sede_id", sedeId)
    .in("estado", ["pendiente", "notificado"])
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "No se pudo cargar la lista de espera." }, { status: 500 });
  return NextResponse.json({ entradas: entradas ?? [] });
}

import { NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { puedeVerTelefonos } from "@/lib/telefono";

export const dynamic = "force-dynamic";

export async function GET() {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  const { data: conversaciones, error } = await supabase
    .from("conversaciones")
    .select("id, telefono, estado, updated_at, cliente:clientes(nombre)")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "No se pudieron cargar las conversaciones." }, { status: 500 });

  // Sin nombre de cliente, la pantalla enseña el teléfono como último
  // recurso para identificar la conversación — pero un barbero no puede
  // verlo, así que para esa cuenta se enseña un texto genérico en su
  // lugar.
  const conversacionesParaElRol = puedeVerTelefonos(admin.rol)
    ? conversaciones
    : (conversaciones ?? []).map((c) => ({ ...c, telefono: null }));

  return NextResponse.json({ conversaciones: conversacionesParaElRol });
}

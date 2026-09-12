import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const busqueda = request.nextUrl.searchParams.get("q")?.trim();
  const supabase = createAdminClient();

  let query = supabase
    .from("clientes")
    .select("id, nombre, telefono, email, notas, created_at, sede_habitual:sedes(nombre)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (busqueda) {
    query = query.or(`nombre.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`);
  }

  const { data: clientes, error } = await query;
  if (error) return NextResponse.json({ error: "No se pudieron cargar los clientes." }, { status: 500 });

  const ids = (clientes ?? []).map((c) => c.id);
  const { data: consentimientos } = await supabase
    .from("consentimientos")
    .select("cliente_id")
    .eq("tipo", "comercial")
    .eq("estado", "activo")
    .in("cliente_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const idsConConsentimiento = new Set((consentimientos ?? []).map((c) => c.cliente_id));

  const resultado = (clientes ?? []).map((c) => ({
    ...c,
    consentimiento_comercial: idsConConsentimiento.has(c.id),
  }));

  return NextResponse.json({ clientes: resultado });
}

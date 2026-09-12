import { NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminApi();
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
  return NextResponse.json({ conversaciones });
}

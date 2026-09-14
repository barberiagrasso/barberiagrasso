import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: campana } = await supabase
    .from("campanas")
    .select("*, plantilla:plantillas_whatsapp(*)")
    .eq("id", id)
    .single();
  if (!campana) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

  const { data: destinatarios } = await supabase
    .from("campana_destinatarios")
    .select("estado, enviado_at, error, cliente:clientes(nombre, telefono)")
    .eq("campana_id", id);

  return NextResponse.json({ campana, destinatarios: destinatarios ?? [] });
}

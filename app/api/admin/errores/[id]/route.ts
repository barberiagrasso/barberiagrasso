import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Marca un error como resuelto. No hay vuelta atrás desde el panel a
// propósito (si vuelve a pasar, se crea un registro nuevo): es solo para
// que Diego pueda ir vaciando la lista de pendientes.
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("errores_sistema")
    .update({ resuelto: true, resuelto_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

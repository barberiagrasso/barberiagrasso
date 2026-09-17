import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Quita una entrada de la lista de espera (el cliente llamó para decir
// que ya no le hace falta, o el equipo prefiere retirarla). No se borra
// la fila — se marca "cancelado", el mismo estado que ya usa el resto
// del sistema para descartar sin perder el historial.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("lista_espera").update({ estado: "cancelado" }).eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo quitar de la lista de espera." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

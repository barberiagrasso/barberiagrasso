import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; destinoId: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id, destinoId } = await params;
  const supabase = createAdminClient();
  // Filtrado también por profesional_id: aunque el id del destino ya es
  // único de por sí, así queda descartado por completo que se borre uno
  // de otro profesional por un id mal pasado.
  const { error } = await supabase.from("destinos_puntuales").delete().eq("id", destinoId).eq("profesional_id", id);

  if (error) return NextResponse.json({ error: "No se pudo borrar el destino puntual." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

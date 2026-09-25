import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCitaHubSpot } from "@/lib/hubspot";

export const dynamic = "force-dynamic";

/**
 * Anular y archivar el recibo de una cita completada (pedido de Diego,
 * 25/09/2026): la cita sigue existiendo tal cual (sigue "completada",
 * sigue contando como visita del cliente), pero deja de contar como
 * dinero real en Informes y en Comisiones — ver los filtros
 * `recibo_anulado_at` añadidos en esas rutas y en lib/recibo.ts.
 *
 * Solo admin: es una corrección financiera (quita facturación e ingresos
 * ya asignados a un barbero), no algo que una cuenta de equipo deba poder
 * hacer sobre su propio cobro — mismo criterio que el resto de Informes
 * (requireRolAdminApi).
 *
 * No toca el saldo de fidelización que ya se le haya podido acumular al
 * cliente por esta visita, ni deshace un bono vendido/canjeado en ella:
 * si hace falta corregir alguno de esos dos, se hace a mano desde la
 * ficha del cliente (mismo criterio que otras correcciones puntuales de
 * este proyecto) — anular un recibo es, a propósito, una operación
 * acotada y siempre reversible (ver el DELETE de abajo).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireRolAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
  if (!motivo) {
    return NextResponse.json({ error: "Indica el motivo de la anulación." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: cita } = await supabase
    .from("citas")
    .select("id, estado, recibo_anulado_at")
    .eq("id", id)
    .maybeSingle();
  if (!cita) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  if (cita.estado !== "completada") {
    return NextResponse.json({ error: "Esta cita no tiene recibo (no está completada)." }, { status: 409 });
  }
  if (cita.recibo_anulado_at) {
    return NextResponse.json({ error: "El recibo de esta cita ya estaba anulado." }, { status: 409 });
  }

  const { error } = await supabase
    .from("citas")
    .update({
      recibo_anulado_at: new Date().toISOString(),
      recibo_anulado_por: admin.nombre,
      recibo_anulado_motivo: motivo,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo anular el recibo." }, { status: 500 });

  await sincronizarCitaHubSpot(supabase, id);

  return NextResponse.json({ ok: true });
}

/** Deshace una anulación hecha por error — misma restricción de admin. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: cita } = await supabase.from("citas").select("id, recibo_anulado_at").eq("id", id).maybeSingle();
  if (!cita) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  if (!cita.recibo_anulado_at) {
    return NextResponse.json({ error: "El recibo de esta cita no estaba anulado." }, { status: 409 });
  }

  const { error } = await supabase
    .from("citas")
    .update({ recibo_anulado_at: null, recibo_anulado_por: null, recibo_anulado_motivo: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo reactivar el recibo." }, { status: 500 });

  await sincronizarCitaHubSpot(supabase, id);

  return NextResponse.json({ ok: true });
}

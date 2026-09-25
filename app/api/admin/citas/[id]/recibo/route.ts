import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerDatosRecibo } from "@/lib/recibo";

export const dynamic = "force-dynamic";

/**
 * Recibo de una cita ya completada, para el panel que se abre al pulsar
 * una cita pagada en la Agenda (ver DetalleCitaPanel en CalendarioDia.tsx).
 * Cualquier cuenta de equipo puede verlo (un barbero ya ve el "$" de
 * pagada en su propia agenda) — anularlo, en cambio, es solo de admin
 * (ver anular-recibo/route.ts).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const recibo = await obtenerDatosRecibo(supabase, id);
  if (!recibo) return NextResponse.json({ error: "Esta cita no tiene recibo (no está completada)." }, { status: 404 });

  return NextResponse.json({ recibo });
}

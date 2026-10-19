import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCampanaAhora, CampanaError } from "@/lib/campanas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manda la campaña a todos sus destinatarios pendientes, usando la
// plantilla aprobada asignada. Solo se puede llamar una vez por campaña
// en estado "borrador" (o "fallida", para reintentar solo los pendientes
// que quedaron sin enviar). Marca cada destinatario como enviado/fallido
// para poder ver el resultado en el panel. La lógica de envío en sí vive
// en lib/campanas.ts (enviarCampanaAhora), compartida con
// /api/cron/campanas-programadas.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();

  try {
    const { enviados, fallidos } = await enviarCampanaAhora(supabase, id);
    return NextResponse.json({ ok: true, enviados, fallidos });
  } catch (err) {
    if (err instanceof CampanaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

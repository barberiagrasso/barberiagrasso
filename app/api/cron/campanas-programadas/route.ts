import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCampanaAhora, CampanaError } from "@/lib/campanas";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manda sola, a su hora, cualquier campaña en borrador que Diego haya
 * dejado programada ("mándala mañana a las 10" — ver `programada_para`
 * en CampanasClient.tsx). Pensado para llamarse cada 15 minutos desde
 * GitHub Actions (.github/workflows/campanas-programadas.yml), igual
 * patrón que recordatorios/retención/backup.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secreto || recibido !== secreto) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: pendientes } = await supabase
    .from("campanas")
    .select("id")
    .eq("estado", "borrador")
    .not("programada_para", "is", null)
    .lte("programada_para", new Date().toISOString());

  let enviadas = 0;
  for (const campana of pendientes ?? []) {
    try {
      await enviarCampanaAhora(supabase, campana.id);
      enviadas++;
    } catch (err) {
      if (!(err instanceof CampanaError)) {
        await registrarError({
          origen: "servidor",
          mensaje: `Fallo mandando la campaña programada ${campana.id}`,
          detalle: err,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, enviadas });
}

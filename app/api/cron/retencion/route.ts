import { NextRequest, NextResponse } from "next/server";
import { ejecutarRetencionDiaria } from "@/lib/retencion";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manda las campañas automáticas de retención (reactivación de clientes
 * inactivos y felicitación de cumpleaños) una vez al día. Ver
 * lib/retencion.ts para toda la lógica; este endpoint solo comprueba el
 * secreto y delega.
 *
 * Igual que /api/cron/recordatorios: protegido con CRON_SECRET y llamado
 * desde GitHub Actions (.github/workflows/retencion.yml), reutilizando el
 * mismo secreto y la misma URL que ya tiene configurados Diego.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secreto || recibido !== secreto) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return NextResponse.json({ ok: true, motivo: "WhatsApp Business todavía no está conectado.", inactivosAvisados: 0, cumpleanosAvisados: 0 });
  }

  try {
    const resultado = await ejecutarRetencionDiaria();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("Error ejecutando la retención diaria", err);
    await registrarError({ origen: "cron_retencion", mensaje: "Fallo en las campañas automáticas de retención", detalle: err });
    return NextResponse.json({ ok: false, error: "Fallo en las campañas de retención." }, { status: 500 });
  }
}

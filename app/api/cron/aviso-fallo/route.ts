import { NextRequest, NextResponse } from "next/server";
import { registrarError, type OrigenError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

const ORIGENES_VALIDOS = new Set<OrigenError>(["cron_backup", "cron_recordatorios", "cron_retencion"]);

/**
 * Red de seguridad para cuando una tarea programada de GitHub Actions
 * (backup, recordatorios, retención) falla ANTES de que el propio
 * endpoint llegue a registrar nada en errores_sistema — p. ej. un fallo
 * de red, el secreto caducado, o la función de Vercel caída. Cada
 * workflow llama aquí con `if: failure()` como último paso, así el
 * aviso ámbar de "errores sin resolver" del panel se entera igual, en
 * vez de que el fallo solo quede visible mirando la pestaña Actions de
 * GitHub a mano. Pedido de Diego, revisión de paneles (19/10/2026).
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secreto || recibido !== secreto) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const origen = ORIGENES_VALIDOS.has(body?.origen) ? (body.origen as OrigenError) : "servidor";

  await registrarError({
    origen,
    mensaje: `La tarea programada "${body?.origen ?? "desconocida"}" falló en GitHub Actions (ver la pestaña Actions del repositorio para el detalle).`,
  });

  return NextResponse.json({ ok: true });
}

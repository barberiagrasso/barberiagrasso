import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Orígenes conocidos, para que el listado de /admin/errores sea
// consistente. No es una restricción dura (la columna es texto libre en
// la base de datos) pero mantiene el código y el panel alineados.
export type OrigenError =
  | "reserva"
  | "cancelacion"
  | "webhook_whatsapp"
  | "cron_recordatorios"
  | "cron_retencion"
  | "cron_backup"
  | "fidelizacion"
  | "servidor";

/**
 * Registra un error de producción en la tabla `errores_sistema` para que
 * se vea desde /admin/errores (y en el aviso ámbar del panel), sin
 * depender de los logs de Vercel que Diego no consulta normalmente.
 *
 * A propósito NUNCA lanza: un fallo guardando el registro del error no
 * debe convertirse en un segundo error que rompa el flujo que ya estaba
 * fallando (por eso también se deja un console.error como red de
 * seguridad final).
 */
export async function registrarError(params: { origen: OrigenError; mensaje: string; detalle?: unknown }): Promise<void> {
  const { origen, mensaje, detalle } = params;
  try {
    const supabase = createAdminClient();
    await supabase.from("errores_sistema").insert({
      origen,
      mensaje: mensaje.slice(0, 2000),
      detalle: formatearDetalle(detalle),
    });
  } catch (errAlRegistrar) {
    console.error("No se pudo registrar el error en errores_sistema", { origen, mensaje }, errAlRegistrar);
  }
}

function formatearDetalle(detalle: unknown): string | null {
  if (detalle === undefined || detalle === null) return null;
  if (detalle instanceof Error) {
    return detalle.stack || detalle.message;
  }
  if (typeof detalle === "string") return detalle.slice(0, 8000);
  try {
    return JSON.stringify(detalle, null, 2).slice(0, 8000);
  } catch {
    return String(detalle).slice(0, 8000);
  }
}

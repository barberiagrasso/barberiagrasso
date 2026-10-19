import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registra una acción sensible hecha desde el panel de admin (quién
 * canceló/movió/completó una cita, por ahora — se puede ir
 * instrumentando en más sitios según haga falta) en `auditoria_admin`,
 * visible de solo lectura en /admin/auditoria. Pedido de Diego
 * (19/10/2026, revisión de paneles): con varias cuentas de equipo con
 * acceso, interesa poder ver quién tocó qué.
 *
 * A propósito NUNCA lanza: un fallo guardando el rastro de auditoría no
 * debe romper la propia acción que se estaba auditando (igual criterio
 * que registrarError en lib/errorLog.ts).
 */
export async function registrarAuditoria(params: {
  adminId: string;
  adminNombre: string;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: unknown;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("auditoria_admin").insert({
      admin_id: params.adminId,
      admin_nombre: params.adminNombre,
      accion: params.accion,
      entidad: params.entidad,
      entidad_id: params.entidadId ?? null,
      detalle: params.detalle ?? null,
    });
  } catch (err) {
    console.error("No se pudo registrar la auditoría", err);
  }
}

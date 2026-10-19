import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import AuditoriaClient from "./AuditoriaClient";

export const dynamic = "force-dynamic";

// Quién hizo qué desde el panel — por ahora cubre cancelar/completar/
// marcar no presentada/mover una cita (ver registrarAuditoria() en
// lib/auditoria.ts); se puede ir ampliando a más acciones si hace
// falta. Solo rol "admin": es información sobre el propio equipo, igual
// criterio que Informes/Campañas/Plantillas.
export default async function AuditoriaPage() {
  await requireRolAdmin();
  const supabase = createAdminClient();

  const { data: entradas } = await supabase
    .from("auditoria_admin")
    .select("id, admin_nombre, accion, entidad, entidad_id, detalle, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Auditoría</h1>
      <p className="mb-4 text-sm text-stone-500">
        Registro de solo lectura de quién canceló, completó, marcó como no presentada o movió de
        hora una cita desde este panel.
      </p>
      <AuditoriaClient entradas={entradas ?? []} />
    </div>
  );
}

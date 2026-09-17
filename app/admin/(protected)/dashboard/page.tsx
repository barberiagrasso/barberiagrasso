import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import AgendaClient from "./AgendaClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { admin } = await requireAdmin();
  const supabase = createAdminClient();
  const [{ data: sedes }, { data: servicios }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, slug").order("nombre"),
    supabase.from("servicios").select("id, nombre, duracion_minutos, precio_centimos, categoria").order("nombre"),
  ]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-stone-900">Agenda</h1>
      <AgendaClient sedes={sedes ?? []} servicios={servicios ?? []} esAdmin={admin.rol === "admin"} />
    </div>
  );
}

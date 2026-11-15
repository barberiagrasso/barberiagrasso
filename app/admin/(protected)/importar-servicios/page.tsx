import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import ImportarServiciosClient from "./ImportarServiciosClient";

export const dynamic = "force-dynamic";

// Dar de alta de golpe los servicios del cartel de Grasso. Solo el dueño,
// y no crea nada hasta que pulsa "Crear servicios".
export default async function ImportarServiciosPage() {
  await requireRolAdmin();
  const { data } = await createAdminClient().from("servicios").select("nombre");
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Servicios del cartel</h1>
      <p className="mb-4 text-sm text-stone-500">
        Revisa precio, duración y grupo de cada servicio y pulsa &quot;Crear servicios&quot;. Los que ya existen no se tocan.
        Se asignan a todos los barberos; luego puedes quitárselo a alguno en Equipo.
      </p>
      <ImportarServiciosClient existentes={(data ?? []).map((s) => s.nombre)} />
    </div>
  );
}

import { requireRolAdmin } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import BloqueosClient from "./BloqueosClient";

export const dynamic = "force-dynamic";

// Solo rol "admin" (ver requireRolAdmin en lib/adminAuth.ts): esta pantalla
// lista, con motivo, los bloqueos/vacaciones de TODOS los barberos de la
// sede a la vez — no es lo que un barbero debe poder ver de sus
// compañeros (pedido de Diego, 25/09/2026). Antes esta ruta no
// comprobaba el rol y solo quedaba oculta del menú, así que una cuenta de
// equipo que conociera la URL podía entrar igualmente.
export default async function BloqueosPage() {
  await requireRolAdmin();
  const supabase = createAdminClient();
  const { data: sedes } = await supabase.from("sedes").select("id, nombre").order("nombre");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Vacaciones y días libres</h1>
      <p className="mb-4 text-sm text-stone-500">
        Bloquea los días u horas que quieras para un empleado (o para toda la sede, por ejemplo un
        festivo) — mientras dure el bloqueo, ni la app ni WhatsApp ofrecerán esas horas.
      </p>
      <BloqueosClient sedes={sedes ?? []} />
    </div>
  );
}

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
      <h1 className="mb-1 text-xl font-bold text-stone-900">Cierres del calendario</h1>
      <p className="mb-4 text-sm text-stone-500">
        Bloquea horas o días para un barbero en concreto, o para toda una sede de golpe (un
        festivo, una reforma...) — mientras dure el bloqueo, ni la app ni WhatsApp ofrecerán esas
        horas. Distinto de &quot;Vacaciones&quot;: aquello es la solicitud y aprobación de días
        libres de cada barbero; esto es el bloqueo directo del calendario, lo use quien lo use.
      </p>
      <BloqueosClient sedes={sedes ?? []} />
    </div>
  );
}

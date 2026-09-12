import { createAdminClient } from "@/lib/supabase/admin";
import BloqueosClient from "./BloqueosClient";

export const dynamic = "force-dynamic";

export default async function BloqueosPage() {
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

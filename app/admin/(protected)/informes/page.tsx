import { createAdminClient } from "@/lib/supabase/admin";
import InformesClient from "./InformesClient";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  const supabase = createAdminClient();
  const { data: sedes } = await supabase.from("sedes").select("id, nombre").order("nombre");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Informes</h1>
      <p className="mb-4 text-sm text-stone-500">
        Elige sede, rango de fechas y pestaña para cruzar ingresos, ocupación, no presentados y
        clientes de todas las formas que necesites, con gráficas y exportación a CSV.
      </p>
      <InformesClient sedes={sedes ?? []} />
    </div>
  );
}

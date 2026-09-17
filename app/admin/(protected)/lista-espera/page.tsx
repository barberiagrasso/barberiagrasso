import { createAdminClient } from "@/lib/supabase/admin";
import ListaEsperaClient from "./ListaEsperaClient";

export const dynamic = "force-dynamic";

export default async function ListaEsperaPage() {
  const supabase = createAdminClient();
  const { data: sedes } = await supabase.from("sedes").select("id, nombre").order("nombre");

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Lista de espera</h1>
      <p className="mb-4 text-sm text-stone-500">
        Clientes esperando un hueco. En cuanto se cancela una cita que les encaja, se les reserva sola y se les avisa
        por WhatsApp — aquí puedes ver quién sigue esperando, agrupado por día.
      </p>
      <ListaEsperaClient sedes={sedes ?? []} />
    </div>
  );
}

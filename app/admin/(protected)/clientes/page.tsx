import { createAdminClient } from "@/lib/supabase/admin";
import ClientesClient from "./ClientesClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const supabase = createAdminClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, saldo_fidelizacion_centimos, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Clientes</h1>
      <p className="mb-4 text-sm text-stone-500">
        Ficha de cada cliente: sus datos, su saldo de fidelización (10% de lo que gasta en cada
        cita, acumulado automáticamente) y el histórico de movimientos de ese saldo. Desde la
        ficha también puedes hacer un ajuste manual si hace falta.
      </p>
      <ClientesClient clientesIniciales={clientes ?? []} />
    </div>
  );
}

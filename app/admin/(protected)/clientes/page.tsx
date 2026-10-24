import { createAdminClient } from "@/lib/supabase/admin";
import { requireRolAdmin } from "@/lib/adminAuth";
import { puedeVerTelefonos } from "@/lib/telefono";
import ClientesClient from "./ClientesClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const { admin } = await requireRolAdmin();
  const supabase = createAdminClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, grassocoins, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Un barbero puede entrar aquí a mirar el saldo de fidelización de un
  // cliente, pero nunca su teléfono — solo un administrador.
  const clientesParaElRol = puedeVerTelefonos(admin.rol)
    ? clientes ?? []
    : (clientes ?? []).map((c) => ({ ...c, telefono: null }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Clientes</h1>
      <p className="mb-4 text-sm text-stone-500">
        Ficha de cada cliente: sus datos, sus GrassoCoins (1 por cada euro que paga, se suman
        solas al cobrar) y el histórico de movimientos. Desde la ficha también puedes sumar o
        restar coins a mano si hace falta.
      </p>
      <ClientesClient clientesIniciales={clientesParaElRol} />
    </div>
  );
}

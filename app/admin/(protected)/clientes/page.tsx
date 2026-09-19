import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/adminAuth";
import { puedeVerTelefonos } from "@/lib/telefono";
import ClientesClient from "./ClientesClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const { admin } = await requireAdmin();
  const supabase = createAdminClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, saldo_fidelizacion_centimos, created_at")
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
        Ficha de cada cliente: sus datos, su saldo de fidelización (10% de lo que gasta en cada
        cita, acumulado automáticamente) y el histórico de movimientos de ese saldo. Desde la
        ficha también puedes hacer un ajuste manual si hace falta.
      </p>
      <ClientesClient clientesIniciales={clientesParaElRol} />
    </div>
  );
}

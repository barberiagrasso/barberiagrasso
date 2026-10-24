import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRolAdmin } from "@/lib/adminAuth";
import { puedeVerTelefonos } from "@/lib/telefono";
import ClienteDetalleClient from "./ClienteDetalleClient";

export const dynamic = "force-dynamic";

export default async function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin } = await requireRolAdmin();
  const supabase = createAdminClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, grassocoins, grassocoins_resto_centimos, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!cliente) notFound();
  if (!puedeVerTelefonos(admin.rol)) cliente.telefono = null;

  const [{ data: movimientos }, { data: citas }] = await Promise.all([
    supabase
      .from("grassocoins_movimientos")
      .select("id, tipo, coins, gasto_centimos, coins_resultantes, nota, creado_por, created_at")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("citas")
      .select("id, inicio, estado, saldo_canjeado_centimos, grassocoins_canjeados, servicio:servicios(nombre), sede:sedes(nombre)")
      .eq("cliente_id", id)
      .order("inicio", { ascending: false })
      .limit(20),
  ]);

  return (
    <ClienteDetalleClient
      cliente={cliente}
      movimientosIniciales={movimientos ?? []}
      citas={(citas ?? []).map((c) => ({
        id: c.id,
        inicio: c.inicio,
        estado: c.estado,
        saldoCanjeadoCentimos: c.saldo_canjeado_centimos,
        grassocoinsCanjeados: c.grassocoins_canjeados ?? 0,
        servicioNombre: (Array.isArray(c.servicio) ? c.servicio[0] : c.servicio)?.nombre ?? "Servicio",
        sedeNombre: (Array.isArray(c.sede) ? c.sede[0] : c.sede)?.nombre ?? "",
      }))}
    />
  );
}

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ClienteDetalleClient from "./ClienteDetalleClient";

export const dynamic = "force-dynamic";

export default async function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, email, saldo_fidelizacion_centimos, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!cliente) notFound();

  const [{ data: movimientos }, { data: citas }] = await Promise.all([
    supabase
      .from("saldo_fidelizacion_movimientos")
      .select("id, tipo, importe_centimos, saldo_resultante_centimos, nota, creado_por, created_at")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("citas")
      .select("id, inicio, estado, saldo_canjeado_centimos, servicio:servicios(nombre), sede:sedes(nombre)")
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
        servicioNombre: (Array.isArray(c.servicio) ? c.servicio[0] : c.servicio)?.nombre ?? "Servicio",
        sedeNombre: (Array.isArray(c.sede) ? c.sede[0] : c.sede)?.nombre ?? "",
      }))}
    />
  );
}

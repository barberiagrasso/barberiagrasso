import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Búsqueda mínima por teléfono para la cita rápida del panel: el barbero
// escribe el número y esto le devuelve SOLO el nombre (si existe ya esa
// ficha), para poder preguntar en persona "¿eres fulanito?" antes de
// registrar la cita. No es una pantalla de listado ni de consulta de
// clientes — es la misma comprobación que ya hace buscarOCrearCliente al
// crear la cita, solo que aquí se enseña ANTES de confirmar.
export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const telefonoBruto = request.nextUrl.searchParams.get("telefono")?.trim();
  if (!telefonoBruto) {
    return NextResponse.json({ error: "Falta el teléfono." }, { status: 400 });
  }

  const telefono = normalizarTelefono(telefonoBruto);
  const supabase = createAdminClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, saldo_fidelizacion_centimos")
    .eq("telefono", telefono)
    .maybeSingle();

  // Aviso de no-shows recientes (pedido de Diego, revisión de paneles
  // 19/10/2026): al registrar una cita nueva por el panel, saber de un
  // vistazo si este cliente concreto ha fallado varias veces últimamente
  // ayuda a decidir si conviene confirmársela antes por WhatsApp. Los
  // últimos 90 días, para no arrastrar un aviso de algo ya muy antiguo.
  let noShowsRecientes = 0;
  if (cliente) {
    const hace90Dias = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from("citas")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", cliente.id)
      .eq("estado", "no_presentada")
      .gte("inicio", hace90Dias);
    noShowsRecientes = count ?? 0;
  }

  return NextResponse.json({
    nombre: cliente?.nombre ?? null,
    saldoFidelizacionCentimos: cliente?.saldo_fidelizacion_centimos ?? 0,
    noShowsRecientes,
  });
}

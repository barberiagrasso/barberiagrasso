import { NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { grassoCoinsDelCliente } from "@/lib/fidelizacion";

export const dynamic = "force-dynamic";

// GrassoCoins de un cliente: las usa el cobro ("Cobrar cita") para saber
// si puede canjear algún producto o merch. Abierta a todo el equipo
// (los barberos cobran); solo devuelve el número, nada más del cliente.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }
  const { id } = await params;
  const grassocoins = await grassoCoinsDelCliente(createAdminClient(), id);
  return NextResponse.json({ grassocoins });
}

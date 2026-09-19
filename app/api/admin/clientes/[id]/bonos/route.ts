import { NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { bonosDelCliente } from "@/lib/bonos";

export const dynamic = "force-dynamic";

// Todos los bonos de un cliente (agotados y caducados incluidos: nunca
// se ocultan, ver lib/bonos.ts). Lo usan tanto la ficha del cliente en
// /admin/clientes/[id] como el checkout ("Finalizar cita") para detectar
// si alguno cubre el servicio que se está cerrando.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  try {
    const bonos = await bonosDelCliente(supabase, id);
    return NextResponse.json({ bonos });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar los bonos del cliente." }, { status: 500 });
  }
}

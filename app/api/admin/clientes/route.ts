import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarOCrearCliente } from "@/lib/clientes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const busqueda = request.nextUrl.searchParams.get("q")?.trim();
  const supabase = createAdminClient();

  let query = supabase
    .from("clientes")
    .select("id, nombre, telefono, email, notas, created_at, user_id, sede_habitual:sedes(nombre)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (busqueda) {
    query = query.or(`nombre.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`);
  }

  const { data: clientes, error } = await query;
  if (error) return NextResponse.json({ error: "No se pudieron cargar los clientes." }, { status: 500 });

  const ids = (clientes ?? []).map((c) => c.id);
  const { data: consentimientos } = await supabase
    .from("consentimientos")
    .select("cliente_id")
    .eq("tipo", "comercial")
    .eq("estado", "activo")
    .in("cliente_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const idsConConsentimiento = new Set((consentimientos ?? []).map((c) => c.cliente_id));

  const resultado = (clientes ?? []).map(({ user_id, ...c }) => ({
    ...c,
    tiene_cuenta: Boolean(user_id),
    consentimiento_comercial: idsConConsentimiento.has(c.id),
  }));

  return NextResponse.json({ clientes: resultado });
}

// Alta manual de un cliente que ha pedido cita por teléfono: solo hacen
// falta nombre y teléfono. Usa el mismo buscador/creador por teléfono que
// la reserva desde la app y el registro de cuenta — así, si esa persona
// se registra más adelante con el mismo número, la cuenta nueva se casa
// sola con esta ficha y con todo lo que se le reserve mientras tanto.
export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const telefono = typeof body?.telefono === "string" ? body.telefono.trim() : "";

  if (!nombre || !telefono) {
    return NextResponse.json({ error: "Nombre y teléfono son obligatorios." }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const { clienteId, esNuevo } = await buscarOCrearCliente(supabase, { nombre, telefono });
    if (!esNuevo) {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese teléfono." },
        { status: 409 }
      );
    }
    return NextResponse.json({ id: clienteId });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar el cliente." }, { status: 500 });
  }
}

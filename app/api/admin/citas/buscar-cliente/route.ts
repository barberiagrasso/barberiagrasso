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
    .select("nombre")
    .eq("telefono", telefono)
    .maybeSingle();

  return NextResponse.json({ nombre: cliente?.nombre ?? null });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Búsqueda de clientes para /admin/clientes: por nombre (contiene) o por
// teléfono (se normaliza igual que al reservar, para que buscar
// "612345678" encuentre al cliente aunque se guardara como "+34612345678").
// Sin "q", enseña los últimos clientes dados de alta.
export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = createAdminClient();

  let consulta = supabase
    .from("clientes")
    .select("id, nombre, telefono, email, saldo_fidelizacion_centimos, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    const pareceTelefono = /\d/.test(q);
    if (pareceTelefono) {
      consulta = consulta.ilike("telefono", `%${normalizarTelefono(q).replace(/^\+/, "")}%`);
    } else {
      consulta = consulta.ilike("nombre", `%${q}%`);
    }
  }

  const { data: clientes, error } = await consulta;
  if (error) return NextResponse.json({ error: "No se pudo buscar clientes." }, { status: 500 });

  return NextResponse.json({ clientes: clientes ?? [] });
}

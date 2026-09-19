import { NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarBonoTipos } from "@/lib/bonos";

export const dynamic = "force-dynamic";

// Los dos tipos de bono (Corte / Corte y barba) están fijos desde la
// migración — aquí no hay POST ni DELETE, solo lectura y el PATCH de
// precio en app/api/admin/bonos-tipos/[id]/route.ts. Cualquier
// admin/barbero puede leerlos (los necesita el checkout para vender un
// bono nuevo); solo un admin puede cambiarles el precio.
export async function GET() {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const supabase = createAdminClient();
  try {
    const tipos = await listarBonoTipos(supabase);
    return NextResponse.json({ tipos });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar los tipos de bono." }, { status: 500 });
  }
}

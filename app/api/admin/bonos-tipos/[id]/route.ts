import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Solo se puede cambiar el precio (nunca la clave, el servicio que
// cubre, los usos ni los días de validez: eso rompería la lectura de
// bonos ya vendidos, que guardan su propia "foto" del precio pagado —
// ver comprarBono en lib/bonos.ts). Estricto rol "admin": es dinero.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.precio_centimos !== "number" || body.precio_centimos < 0) {
    return NextResponse.json({ error: "Falta un precio válido." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tipo, error } = await supabase
    .from("bonos_tipos")
    .update({ precio_centimos: Math.round(body.precio_centimos), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar el precio del bono." }, { status: 400 });
  }
  return NextResponse.json({ tipo });
}

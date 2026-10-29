import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajustarGrassoCoinsManual } from "@/lib/fidelizacion";

export const dynamic = "force-dynamic";

// Ajuste manual de las GrassoCoins de un cliente desde su ficha en
// /admin/clientes/[id] — por ejemplo, un detalle comercial o para
// corregir un error. Pasa por ajustarGrassoCoinsManual()
// (lib/fidelizacion.ts), que deja constancia de quién lo hizo y por qué
// en el histórico del cliente.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireRolAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const coins = Number(body?.coins);
  const nota = typeof body?.nota === "string" ? body.nota.trim() : "";

  if (!Number.isInteger(coins) || coins === 0) {
    return NextResponse.json({ error: "Indica un número entero de GrassoCoins distinto de cero." }, { status: 400 });
  }
  if (!nota) {
    return NextResponse.json({ error: "Explica brevemente el motivo del ajuste." }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const nuevasCoins = await ajustarGrassoCoinsManual(supabase, {
      clienteId: id,
      coins,
      nota,
      creadoPor: admin.nombre,
    });
    return NextResponse.json({ ok: true, grassocoins: nuevasCoins });
  } catch {
    return NextResponse.json(
      { error: "No se pudo aplicar el ajuste (¿deja al cliente con GrassoCoins en negativo?)." },
      { status: 409 }
    );
  }
}

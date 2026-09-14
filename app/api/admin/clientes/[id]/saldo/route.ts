import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajustarSaldoManual } from "@/lib/fidelizacion";

export const dynamic = "force-dynamic";

// Ajuste manual del saldo de fidelización de un cliente desde su ficha en
// /admin/clientes/[id] — por ejemplo, un detalle comercial o para
// corregir un error. Pasa por ajustarSaldoManual() (lib/fidelizacion.ts),
// que deja constancia de quién lo hizo y por qué en el histórico del
// cliente, igual que cualquier otro movimiento de saldo.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const importeCentimos = Number(body?.importeCentimos);
  const nota = typeof body?.nota === "string" ? body.nota.trim() : "";

  if (!Number.isFinite(importeCentimos) || importeCentimos === 0) {
    return NextResponse.json({ error: "Indica un importe distinto de cero." }, { status: 400 });
  }
  if (!nota) {
    return NextResponse.json({ error: "Explica brevemente el motivo del ajuste." }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const nuevoSaldo = await ajustarSaldoManual(supabase, {
      clienteId: id,
      importeCentimos: Math.round(importeCentimos),
      nota,
      creadoPor: admin.nombre,
    });
    return NextResponse.json({ ok: true, saldoFidelizacionCentimos: nuevoSaldo });
  } catch {
    return NextResponse.json(
      { error: "No se pudo aplicar el ajuste (¿el importe deja el saldo en negativo?)." },
      { status: 409 }
    );
  }
}

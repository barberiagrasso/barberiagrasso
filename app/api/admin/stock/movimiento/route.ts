import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sedesDeStock } from "@/lib/stockAcceso";

export const dynamic = "force-dynamic";

// Entrada de pedido, recuento o ajuste, hecho por el dueño o por el
// encargado de esa sede. Queda apuntado con su nombre.
export async function POST(request: NextRequest) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  const tipo = body?.tipo as string;
  const cantidad = Number(body?.cantidad);
  if (!["entrada", "recuento", "ajuste"].includes(tipo)) return NextResponse.json({ error: "Tipo no válido." }, { status: 400 });
  if (!Number.isInteger(cantidad) || Math.abs(cantidad) > 10000) return NextResponse.json({ error: "Cantidad no válida." }, { status: 400 });
  if ((tipo === "entrada" || tipo === "recuento") && cantidad < 0) return NextResponse.json({ error: "La cantidad no puede ser negativa." }, { status: 400 });
  if (tipo !== "recuento" && cantidad === 0) return NextResponse.json({ error: "Pon una cantidad." }, { status: 400 });

  const { sedes } = await sedesDeStock(admin);
  if (!sedes.some((s) => s.id === body?.sedeId)) return NextResponse.json({ error: "No puedes tocar el stock de esa sede." }, { status: 403 });

  const { data, error } = await createAdminClient().rpc("registrar_movimiento_stock", {
    p_producto_id: body.productoId,
    p_sede_id: body.sedeId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_nota: typeof body.nota === "string" && body.nota.trim() ? body.nota.trim().slice(0, 200) : null,
    p_admin_id: admin.id,
    p_admin_nombre: admin.nombre ?? null,
  });
  if (error) return NextResponse.json({ error: "No se pudo guardar el movimiento." }, { status: 500 });
  return NextResponse.json({ ok: true, stock: data });
}

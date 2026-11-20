import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Actualiza cualquier combinación de campos de un producto. No hay
// DELETE a propósito: un producto puede estar referenciado por citas ya
// cerradas (cita_productos), así que en vez de borrarlo se desactiva
// (activo: false) y deja de aparecer en el selector del barbero, pero el
// histórico de ventas se mantiene intacto.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    ({ admin } = await requireRolAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });

  const campos: Record<string, unknown> = {};
  // "stock" queda fuera de este bucle a propósito: se gestiona aparte
  // más abajo para poder dejar rastro en movimientos_stock (pedido de
  // Diego, 13/11/2026 — "no se puede auditar por qué bajan las
  // existencias").
  for (const clave of ["nombre", "categoria", "precio_centimos", "orden", "activo", "stock_minimo"]) {
    if (clave in body) campos[clave] = body[clave];
  }
  // Merch / tienda de la app y GrassoCoins (27/10/2026).
  if ("visible_en_app" in body) campos.visible_en_app = Boolean(body.visible_en_app);
  if ("descripcion" in body) {
    campos.descripcion = typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 300) || null : null;
  }
  if ("coste_grassocoins" in body) {
    const coste = body.coste_grassocoins;
    if (coste !== null && !(Number.isInteger(coste) && coste > 0)) {
      return NextResponse.json({ error: "El precio en GrassoCoins tiene que ser un número entero mayor que 0 (o vacío)." }, { status: 400 });
    }
    campos.coste_grassocoins = coste;
  }

  const supabase = createAdminClient();

  // Cambio de stock: si el producto ya llevaba stock controlado y sigue
  // llevándolo, la diferencia entre el valor anterior y el nuevo se
  // aplica como un movimiento de tipo "ajuste" (ver
  // registrar_movimiento_stock en
  // supabase/anadir-historial-movimientos-stock.sql), que deja rastro de
  // quién lo cambió y cuándo. Empezar o dejar de controlar stock (de
  // número a NULL o viceversa) es un cambio de configuración, no un
  // movimiento, así que se guarda directo sin pasar por el historial.
  let movimientoDelta = 0;
  if ("stock" in body) {
    const nuevo = body.stock;
    if (nuevo !== null && !Number.isInteger(nuevo)) {
      return NextResponse.json({ error: "El stock tiene que ser un número entero (o vacío)." }, { status: 400 });
    }
    const { data: filaActual, error: errorActual } = await supabase.from("productos").select("stock").eq("id", id).single();
    if (errorActual || !filaActual) return NextResponse.json({ error: "No se pudo leer el producto." }, { status: 400 });
    const anterior = filaActual.stock;
    if (anterior === null || nuevo === null) {
      campos.stock = nuevo;
    } else if (nuevo !== anterior) {
      movimientoDelta = nuevo - anterior;
    }
  }

  if (Object.keys(campos).length === 0 && movimientoDelta === 0) {
    return NextResponse.json({ error: "No hay campos que actualizar." }, { status: 400 });
  }

  if (Object.keys(campos).length > 0) {
    const { error } = await supabase.from("productos").update(campos).eq("id", id);
    if (error) return NextResponse.json({ error: "No se pudo actualizar el producto." }, { status: 400 });
  }

  if (movimientoDelta !== 0) {
    const { error: errorMovimiento } = await supabase.rpc("registrar_movimiento_stock", {
      p_producto_id: id,
      p_tipo: "ajuste",
      p_delta: movimientoDelta,
      p_motivo: "Editado desde el panel",
      p_creado_por: admin.nombre ?? "—",
    });
    if (errorMovimiento) return NextResponse.json({ error: "No se pudo actualizar el stock." }, { status: 400 });
  }

  const { data: producto, error: errorFinal } = await supabase.from("productos").select("*").eq("id", id).single();
  if (errorFinal || !producto) {
    return NextResponse.json({ error: "No se pudo leer el producto actualizado." }, { status: 400 });
  }
  return NextResponse.json({ producto });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCitaHubSpot } from "@/lib/hubspot";
import { acumularPorCitaCompletada } from "@/lib/fidelizacion";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

interface ProductoElegido {
  productoId: string;
  cantidad: number;
}

/**
 * Cierra una cita "de verdad": a diferencia del PATCH normal (que solo
 * cambia el estado, o mueve hora/profesional para un reagendado), este
 * endpoint es el que usa el modal "Finalizar cita" del barbero — en un
 * único guardado puede:
 *
 *  - cambiar el servicio principal realizado,
 *  - sustituir la lista de complementos (cita_extras) por otra distinta
 *    (puede añadir, quitar o dejar los que ya traía la reserva),
 *  - añadir productos vendidos en el momento (cita_productos),
 *  - cambiar qué profesional la realizó de verdad,
 *  - corregir la hora de inicio y de fin (no se recalculan a partir de
 *    la duración del servicio: las pone el barbero a mano),
 *
 * y deja la cita como "completada". Todo o nada: si algo falla a medio
 * camino no se ha movido nada (ver el try/catch de más abajo).
 *
 * Solo sirve para cerrar una cita que todavía está "confirmada" — una
 * vez completada, esta pantalla no vuelve a estar disponible desde el
 * panel para esa cita (decisión de Diego, 17/09/2026): si hay que
 * corregir algo después, se hace a mano en Supabase.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  const servicioId = typeof body?.servicioId === "string" ? body.servicioId : "";
  const profesionalId = typeof body?.profesionalId === "string" ? body.profesionalId : "";
  const inicioISO = typeof body?.inicioISO === "string" ? body.inicioISO : "";
  const finISO = typeof body?.finISO === "string" ? body.finISO : "";
  const extrasServicioIds: string[] = Array.isArray(body?.extrasServicioIds)
    ? body.extrasServicioIds.filter((v: unknown) => typeof v === "string")
    : [];
  const productosElegidos: ProductoElegido[] = Array.isArray(body?.productos)
    ? body.productos
        .filter((p: unknown): p is ProductoElegido => Boolean(p && typeof (p as ProductoElegido).productoId === "string"))
        .map((p: ProductoElegido) => ({ productoId: p.productoId, cantidad: Math.max(1, Math.round(Number(p.cantidad) || 1)) }))
    : [];

  if (!servicioId || !profesionalId || !inicioISO || !finISO) {
    return NextResponse.json({ error: "Faltan datos obligatorios (servicio, profesional u horario)." }, { status: 400 });
  }
  const inicio = new Date(inicioISO);
  const fin = new Date(finISO);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin <= inicio) {
    return NextResponse.json({ error: "El horario no es válido: la hora de fin debe ser posterior a la de inicio." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: citaActual } = await supabase
    .from("citas")
    .select("id, cliente_id, estado, saldo_canjeado_centimos")
    .eq("id", id)
    .maybeSingle();
  if (!citaActual) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  if (citaActual.estado !== "confirmada") {
    return NextResponse.json({ error: "Esta cita ya no está pendiente de completar." }, { status: 409 });
  }

  const { data: servicio } = await supabase.from("servicios").select("id, precio_centimos").eq("id", servicioId).maybeSingle();
  if (!servicio) return NextResponse.json({ error: "Servicio no encontrado." }, { status: 404 });

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", profesionalId).maybeSingle();
  if (!profesional) return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });

  // Mismo criterio de conflicto que el PATCH normal al mover una cita de
  // hora o de profesional: que el profesional elegido no tenga ya otra
  // cita (no cancelada) que se solape con el horario corregido.
  const { data: conflictos } = await supabase
    .from("citas")
    .select("id")
    .eq("profesional_id", profesionalId)
    .neq("id", id)
    .neq("estado", "cancelada")
    .lt("inicio", fin.toISOString())
    .gt("fin", inicio.toISOString());
  if (conflictos && conflictos.length > 0) {
    return NextResponse.json({ error: "Ese profesional ya tiene otra cita a esa hora." }, { status: 409 });
  }

  let extrasParaGuardar: { servicio_id: string; precio_centimos: number; duracion_minutos: number }[] = [];
  if (extrasServicioIds.length > 0) {
    const { data: extras } = await supabase
      .from("servicios")
      .select("id, precio_centimos, duracion_minutos")
      .in("id", extrasServicioIds);
    extrasParaGuardar = (extras ?? []).map((e) => ({
      servicio_id: e.id,
      precio_centimos: e.precio_centimos,
      duracion_minutos: e.duracion_minutos,
    }));
  }

  let productosParaGuardar: { producto_id: string; cantidad: number; precio_centimos: number }[] = [];
  if (productosElegidos.length > 0) {
    const ids = productosElegidos.map((p) => p.productoId);
    const { data: productosCatalogo } = await supabase.from("productos").select("id, precio_centimos").in("id", ids);
    const precioPorId = new Map((productosCatalogo ?? []).map((p) => [p.id, p.precio_centimos]));
    productosParaGuardar = productosElegidos
      .filter((p) => precioPorId.has(p.productoId))
      .map((p) => ({
        producto_id: p.productoId,
        cantidad: p.cantidad,
        precio_centimos: precioPorId.get(p.productoId)!,
      }));
  }

  const { error: errorCita } = await supabase
    .from("citas")
    .update({
      servicio_id: servicioId,
      profesional_id: profesionalId,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado: "completada",
    })
    .eq("id", id);

  if (errorCita) {
    await registrarError({ origen: "servidor", mensaje: "No se pudo finalizar la cita.", detalle: errorCita });
    return NextResponse.json({ error: "No se pudo guardar la cita." }, { status: 500 });
  }

  // Sustituye del todo los complementos y productos por la lista final
  // que ha dejado el barbero (puede coincidir con lo que ya había, tener
  // menos, o tener más) — más simple y fiable que calcular una diferencia.
  await supabase.from("cita_extras").delete().eq("cita_id", id);
  if (extrasParaGuardar.length > 0) {
    await supabase.from("cita_extras").insert(extrasParaGuardar.map((e) => ({ cita_id: id, ...e })));
  }

  await supabase.from("cita_productos").delete().eq("cita_id", id);
  if (productosParaGuardar.length > 0) {
    await supabase.from("cita_productos").insert(productosParaGuardar.map((p) => ({ cita_id: id, ...p })));
  }

  await sincronizarCitaHubSpot(supabase, id);
  // La fidelización se calcula solo sobre servicio + complementos (ver
  // lib/fidelizacion.ts): los productos no generan saldo, a propósito,
  // igual que no aparecen en ningún otro sitio de la app del cliente.
  await acumularPorCitaCompletada(supabase, {
    id: citaActual.id,
    cliente_id: citaActual.cliente_id,
    saldo_canjeado_centimos: citaActual.saldo_canjeado_centimos,
  });

  return NextResponse.json({ ok: true });
}

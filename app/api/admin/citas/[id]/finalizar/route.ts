import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCitaHubSpot } from "@/lib/hubspot";
import { acumularPorCitaCompletada } from "@/lib/fidelizacion";
import { registrarError } from "@/lib/errorLog";
import { comprarBono, canjearUsoBono, BonoNoDisponibleError } from "@/lib/bonos";

export const dynamic = "force-dynamic";

interface ProductoElegido {
  productoId: string;
  cantidad: number;
}

const METODOS_PAGO_VALIDOS = new Set(["efectivo", "tarjeta", "bizum", "bono", "otro"]);

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
 *  - anotar el método de pago (efectivo, tarjeta, bizum, bono, otro) —
 *    "bono" cubre tanto vender un bono nuevo (body.bono.accion:"comprar")
 *    como canjear un uso de uno ya existente (body.bono.accion:"canjear";
 *    ver lib/bonos.ts) — y, si hace falta,
 *  - corregir a mano el precio final (precioFinalCentimos)
 *    cuando lo cobrado de verdad no coincide con el cálculo automático de
 *    servicio + complementos — ese número pasa a ser el que cuenta en
 *    comisiones, fidelización, HubSpot y el historial del cliente (ver
 *    lib/precios.ts).
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
  const metodoPago: string | null = typeof body?.metodoPago === "string" && METODOS_PAGO_VALIDOS.has(body.metodoPago) ? body.metodoPago : null;
  // undefined = "no se tocó el precio, usa el automático"; number = override a mano.
  const precioFinalCentimos: number | undefined =
    typeof body?.precioFinalCentimos === "number" && Number.isFinite(body.precioFinalCentimos)
      ? Math.max(0, Math.round(body.precioFinalCentimos))
      : undefined;
  // "comprar" = se vende un bono nuevo en esta misma cita (bonoTipoId
  // dice cuál); "canjear" = se descuenta un uso de un bono que el
  // cliente ya tenía (bonoId dice cuál). Ver lib/bonos.ts.
  const bonoAccion: { accion: "comprar"; bonoTipoId: string } | { accion: "canjear"; bonoId: string } | null =
    body?.bono?.accion === "comprar" && typeof body.bono.bonoTipoId === "string"
      ? { accion: "comprar", bonoTipoId: body.bono.bonoTipoId }
      : body?.bono?.accion === "canjear" && typeof body.bono.bonoId === "string"
        ? { accion: "canjear", bonoId: body.bono.bonoId }
        : null;

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

  // El bono se compra o se canjea ANTES de tocar la cita: si esto falla
  // (p. ej. el bono ya se agotó en otra pestaña un segundo antes), la
  // cita se queda tal cual, sin marcar completada ni con nada a medias.
  let bonoIdParaCita: string | null = null;
  let bonoNuevoCreadoId: string | null = null;
  if (bonoAccion?.accion === "comprar") {
    try {
      const bono = await comprarBono(supabase, { clienteId: citaActual.cliente_id, bonoTipoId: bonoAccion.bonoTipoId });
      bonoIdParaCita = bono.id;
      bonoNuevoCreadoId = bono.id;
    } catch {
      return NextResponse.json({ error: "No se pudo crear el bono. Revisa el tipo elegido." }, { status: 400 });
    }
  } else if (bonoAccion?.accion === "canjear") {
    try {
      const bono = await canjearUsoBono(supabase, bonoAccion.bonoId);
      bonoIdParaCita = bono.id;
    } catch (err) {
      const mensaje = err instanceof BonoNoDisponibleError ? "Ese bono ya no tiene usos disponibles." : "No se pudo canjear el bono.";
      return NextResponse.json({ error: mensaje }, { status: 409 });
    }
  }

  const { error: errorCita } = await supabase
    .from("citas")
    .update({
      servicio_id: servicioId,
      profesional_id: profesionalId,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado: "completada",
      metodo_pago: metodoPago,
      bono_id: bonoIdParaCita,
      ...(precioFinalCentimos !== undefined ? { precio_final_centimos: precioFinalCentimos } : {}),
    })
    .eq("id", id);

  if (errorCita) {
    // Deshace el bono que se acabara de tocar, para no dejar un uso
    // gastado (o un bono nuevo sin cita) huérfano si esta parte falla.
    if (bonoNuevoCreadoId) {
      await supabase.from("bonos").delete().eq("id", bonoNuevoCreadoId);
    } else if (bonoAccion?.accion === "canjear") {
      await supabase.rpc("devolver_uso_bono", { p_bono_id: bonoAccion.bonoId });
    }
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

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCitaHubSpot } from "@/lib/hubspot";
import { acumularPorCitaCompletada } from "@/lib/fidelizacion";
import { registrarError } from "@/lib/errorLog";
import { comprarBono, canjearUsoBono, BonoNoDisponibleError } from "@/lib/bonos";
import { precioCitaCentimos } from "@/lib/precios";

export const dynamic = "force-dynamic";

interface ProductoElegido {
  productoId: string;
  cantidad: number;
}

const METODOS_PAGO_VALIDOS = new Set(["efectivo", "tarjeta", "bizum", "bono", "otro"]);
// Métodos que se pueden combinar en un pago repartido por %. "bono" queda
// fuera: vender o canjear un bono es un modo de pago exclusivo aparte (ver
// FinalizarCitaModal.tsx), no algo que se mezcle con un % de efectivo o
// tarjeta.
const METODOS_PAGO_MIXTO_VALIDOS = new Set(["efectivo", "tarjeta", "bizum", "otro"]);
// Tolerancia al comprobar que los % de un pago repartido suman 100 (evita
// que un redondeo de una cifra decimal en el propio input del barbero,
// p. ej. 33.33 + 33.33 + 33.34, rebote como error).
const TOLERANCIA_SUMA_PORCENTAJES = 0.05;

interface PagoElegido {
  metodo: string;
  porcentaje: number;
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
 *  - anotar el método de pago (efectivo, tarjeta, bizum, bono, otro) —
 *    "bono" cubre tanto vender un bono nuevo (body.bono.accion:"comprar")
 *    como canjear un uso de uno ya existente (body.bono.accion:"canjear";
 *    ver lib/bonos.ts) — y, si hace falta,
 *  - corregir a mano el precio final (precioFinalCentimos)
 *    cuando lo cobrado de verdad no coincide con el cálculo automático de
 *    servicio + complementos — ese número pasa a ser el que cuenta en
 *    comisiones, fidelización, HubSpot y el historial del cliente (ver
 *    lib/precios.ts), y
 *  - aplicar un descuento por % con motivo obligatorio (descuentoPorcentaje
 *    + descuentoMotivo): el precioFinalCentimos que se manda ya viene con
 *    el descuento restado (lo calcula el propio modal), pero estos dos
 *    campos quedan guardados aparte para que la comisión del barbero se
 *    siga calculando sobre el total SIN descontar (ver ingresoCitaCentimos
 *    en app/api/admin/comisiones/route.ts) y para que Diego pueda revisar
 *    todos los descuentos aplicados desde Informes → Descuentos.
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
  // Pago repartido entre varios métodos (checkout, ver FinalizarCitaModal.tsx
  // y anadir-pagos-mixtos.sql): solo se manda `pagos` cuando el barbero ha
  // elegido más de un método para esta cita — con uno solo se sigue usando
  // el campo `metodoPago` de siempre, sin tocar la tabla cita_pagos. Cuando
  // sí llega, tiene que traer 2 o más métodos válidos (no "bono") cuyos %
  // sumen 100 (con un margen mínimo para el redondeo del propio input).
  let pagosMixtos: PagoElegido[] | null = null;
  if (Array.isArray(body?.pagos) && body.pagos.length > 0) {
    const pagosCrudo = body.pagos as unknown[];
    const pagosParseados: PagoElegido[] = pagosCrudo
      .filter((p): p is { metodo: unknown; porcentaje: unknown } => Boolean(p && typeof p === "object"))
      .map((p) => ({
        metodo: typeof (p as { metodo: unknown }).metodo === "string" ? (p as { metodo: string }).metodo : "",
        porcentaje: Number((p as { porcentaje: unknown }).porcentaje),
      }));
    if (pagosParseados.length < 2) {
      return NextResponse.json({ error: "Un pago repartido necesita al menos dos métodos." }, { status: 400 });
    }
    for (const p of pagosParseados) {
      if (!METODOS_PAGO_MIXTO_VALIDOS.has(p.metodo)) {
        return NextResponse.json({ error: "Método de pago no válido para un pago repartido." }, { status: 400 });
      }
      if (!Number.isFinite(p.porcentaje) || p.porcentaje <= 0 || p.porcentaje > 100) {
        return NextResponse.json({ error: "Cada método necesita un % entre 1 y 100." }, { status: 400 });
      }
    }
    const sumaPorcentajes = pagosParseados.reduce((acc, p) => acc + p.porcentaje, 0);
    if (Math.abs(sumaPorcentajes - 100) > TOLERANCIA_SUMA_PORCENTAJES) {
      return NextResponse.json({ error: "Los porcentajes del pago repartido deben sumar 100." }, { status: 400 });
    }
    pagosMixtos = pagosParseados;
  }
  // undefined = "no se tocó el precio, usa el automático"; number = override a mano.
  const precioFinalCentimos: number | undefined =
    typeof body?.precioFinalCentimos === "number" && Number.isFinite(body.precioFinalCentimos)
      ? Math.max(0, Math.round(body.precioFinalCentimos))
      : undefined;
  // Descuento por % con motivo (checkout, ver FinalizarCitaModal.tsx):
  // undefined = no se aplicó ningún descuento estructurado en esta cita.
  // Cuando sí se manda, ambos campos son obligatorios juntos — el motivo
  // nunca puede faltar (también hay un check en la propia base de datos,
  // ver anadir-descuento-checkout.sql, por si algún día se escribe aquí
  // sin pasar por este endpoint).
  const descuentoPorcentajeCrudo = body?.descuentoPorcentaje;
  const descuentoMotivoCrudo = typeof body?.descuentoMotivo === "string" ? body.descuentoMotivo.trim() : "";
  let descuentoPorcentaje: number | undefined;
  let descuentoMotivo: string | undefined;
  if (descuentoPorcentajeCrudo !== undefined && descuentoPorcentajeCrudo !== null) {
    const valor = Number(descuentoPorcentajeCrudo);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 100 || !descuentoMotivoCrudo) {
      return NextResponse.json({ error: "El descuento necesita un % entre 1 y 100 y un motivo." }, { status: 400 });
    }
    descuentoPorcentaje = valor;
    descuentoMotivo = descuentoMotivoCrudo;
  }
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

  // Importe exacto de cada método del pago repartido (si lo hay), sobre el
  // mismo total que ve el barbero en el modal: servicio (ya con cualquier
  // precio final a mano) + complementos + productos — mismo criterio que
  // precioCitaCentimos en comisiones/informes, con los productos sumados
  // aparte porque nunca han pasado por ese campo. Se calcula en centimos
  // en vez de fiarse del redondeo del propio navegador, y el último método
  // se lleva el resto de la división para que la suma cuadre siempre con
  // el total exacto, sin descuadres de un céntimo por el redondeo del resto.
  let pagosParaGuardar: { metodo: string; porcentaje: number; importe_centimos: number }[] = [];
  if (pagosMixtos) {
    const automaticoCentimos =
      servicio.precio_centimos + extrasParaGuardar.reduce((acc, e) => acc + e.precio_centimos, 0);
    const totalServicioCentimos = precioCitaCentimos(precioFinalCentimos, automaticoCentimos);
    const totalProductosCentimos = productosParaGuardar.reduce((acc, p) => acc + p.precio_centimos * p.cantidad, 0);
    const totalCentimos = totalServicioCentimos + totalProductosCentimos;

    let asignado = 0;
    pagosParaGuardar = pagosMixtos.map((p, i) => {
      const esUltimo = i === pagosMixtos!.length - 1;
      const importe = esUltimo ? totalCentimos - asignado : Math.round((totalCentimos * p.porcentaje) / 100);
      asignado += importe;
      return { metodo: p.metodo, porcentaje: p.porcentaje, importe_centimos: Math.max(0, importe) };
    });
  }
  const metodoPagoFinal = pagosMixtos ? "mixto" : metodoPago;

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
      metodo_pago: metodoPagoFinal,
      bono_id: bonoIdParaCita,
      ...(precioFinalCentimos !== undefined ? { precio_final_centimos: precioFinalCentimos } : {}),
      // Siempre se escriben las dos juntas (o ninguna): si esta cita ya
      // tenía un descuento de una edición anterior y esta vez no se manda
      // ninguno, hay que borrarlo explícitamente con null, no dejarlo tal
      // cual — este modal no admite reabrir una cita ya completada, pero
      // sí corregirla antes de guardar dentro de la misma sesión del modal.
      descuento_porcentaje: descuentoPorcentaje ?? null,
      descuento_motivo: descuentoMotivo ?? null,
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

  // Mismo criterio: se sustituye del todo. Si esta cita no se paga con
  // varios métodos (el caso normal), no queda ninguna fila — el método
  // único ya está en citas.metodo_pago.
  await supabase.from("cita_pagos").delete().eq("cita_id", id);
  if (pagosParaGuardar.length > 0) {
    await supabase.from("cita_pagos").insert(pagosParaGuardar.map((p) => ({ cita_id: id, ...p })));
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

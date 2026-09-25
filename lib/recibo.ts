import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { precioCitaCentimos } from "@/lib/precios";

// =====================================================================
// Recibo de una cita ya completada — pantalla nueva pedida por Diego
// (25/09/2026, con capturas de Booksy de referencia): al pulsar una cita
// pagada en la Agenda (o en "Mi perfil" del propio cliente) se ve un
// desglose tipo recibo, con la posibilidad de anularlo y archivarlo (deja
// de contar en facturación/comisiones, ver los informes y
// app/api/admin/comisiones/route.ts) o de mandarlo por WhatsApp.
//
// Este archivo centraliza cómo se construye ese recibo para que el panel
// de admin (app/api/admin/citas/[id]/recibo/route.ts, usado también por
// el envío de WhatsApp) y el perfil del cliente (app/perfil/page.tsx)
// muestren exactamente el mismo desglose con la misma lógica de precios
// que ya usan comisiones/informes (ver lib/precios.ts).
// =====================================================================

export interface LineaRecibo {
  nombre: string;
  cantidad: number;
  precioUnitarioCentimos: number;
}

export interface PagoRecibo {
  metodo: string;
  importeCentimos: number;
}

export interface DatosRecibo {
  citaId: string;
  // Código corto solo para enseñar algo tipo "Recibo #A1B2C3D4" — no es
  // un número de serie fiscal real, esta app no lleva numeración de
  // facturación oficial.
  codigo: string;
  fechaCitaISO: string;
  pagadoAtISO: string | null;
  sedeNombre: string;
  sedeDireccion: string | null;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  profesionalNombre: string;
  lineas: LineaRecibo[];
  subtotalCentimos: number;
  descuentoCentimos: number;
  descuentoMotivo: string | null;
  totalCentimos: number;
  pagadoConSaldoCentimos: number;
  metodoPago: string | null;
  pagosMixtos: PagoRecibo[];
  anulado: { atISO: string; por: string | null; motivo: string | null } | null;
}

function uno<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Terminal de tarjeta física",
  bizum: "Bizum",
  bono: "Bono",
  otro: "Otro método",
  mixto: "Varios métodos",
};

export function etiquetaMetodoPago(metodo: string | null): string {
  if (!metodo) return "Sin especificar";
  return ETIQUETA_METODO[metodo] ?? metodo;
}

interface CitaCruda {
  id: string;
  inicio: string;
  estado: string;
  pagado_at: string | null;
  metodo_pago: string | null;
  precio_final_centimos: number | null;
  saldo_canjeado_centimos: number;
  descuento_porcentaje: number | null;
  descuento_motivo: string | null;
  recibo_anulado_at: string | null;
  recibo_anulado_por: string | null;
  recibo_anulado_motivo: string | null;
  cliente: { id: string; nombre: string; telefono: string | null } | { id: string; nombre: string; telefono: string | null }[] | null;
  sede: { nombre: string; direccion: string | null } | { nombre: string; direccion: string | null }[] | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
  servicio: { nombre: string; precio_centimos: number } | { nombre: string; precio_centimos: number }[] | null;
}
interface ExtraCrudo {
  precio_centimos: number;
  servicio: { nombre: string } | { nombre: string }[] | null;
}
interface ProductoCrudo {
  cantidad: number;
  precio_centimos: number;
  producto: { nombre: string } | { nombre: string }[] | null;
}
interface PagoCrudo {
  metodo: string;
  importe_centimos: number;
}

/**
 * Construye el recibo a partir de los datos ya cargados (una cita
 * "completada" con sus relaciones, sus complementos, sus productos
 * vendidos y su reparto de pago si lo hubiera) — pura, sin acceso a la
 * base de datos, para poder reutilizarla tanto en la consulta suelta de
 * una cita (obtenerDatosRecibo) como en el listado en bloque del
 * historial del cliente (app/perfil/page.tsx), que trae varias citas a
 * la vez para no hacer N consultas repetidas.
 */
export function construirRecibo(params: {
  cita: CitaCruda;
  extras: ExtraCrudo[];
  productos: ProductoCrudo[];
  pagos: PagoCrudo[];
}): DatosRecibo {
  const { cita, extras, productos, pagos } = params;
  const cliente = uno(cita.cliente);
  const sede = uno(cita.sede);
  const profesional = uno(cita.profesional);
  const servicio = uno(cita.servicio);

  const lineas: LineaRecibo[] = [];
  if (servicio) {
    lineas.push({ nombre: servicio.nombre, cantidad: 1, precioUnitarioCentimos: servicio.precio_centimos });
  }
  for (const e of extras) {
    const s = uno(e.servicio);
    lineas.push({ nombre: s?.nombre ?? "Complemento", cantidad: 1, precioUnitarioCentimos: e.precio_centimos });
  }
  for (const p of productos) {
    const prod = uno(p.producto);
    lineas.push({ nombre: prod?.nombre ?? "Producto", cantidad: p.cantidad, precioUnitarioCentimos: p.precio_centimos });
  }

  // Mismo criterio que comisiones/informes (ver lib/precios.ts): el
  // automático es servicio + complementos, y precio_final_centimos (si
  // el barbero lo corrigió a mano al cerrar la cita) manda por encima —
  // los productos, aparte, siempre cuentan enteros.
  const automaticoServicioCentimos = (servicio?.precio_centimos ?? 0) + extras.reduce((acc, e) => acc + e.precio_centimos, 0);
  const cobradoServicioCentimos = precioCitaCentimos(cita.precio_final_centimos, automaticoServicioCentimos);
  const totalProductosCentimos = productos.reduce((acc, p) => acc + p.cantidad * p.precio_centimos, 0);
  const subtotalCentimos = automaticoServicioCentimos + totalProductosCentimos;
  const totalCentimos = cobradoServicioCentimos + totalProductosCentimos;
  const descuentoCentimos = Math.max(0, subtotalCentimos - totalCentimos);

  const pagosMixtos: PagoRecibo[] = pagos.map((p) => ({ metodo: p.metodo, importeCentimos: p.importe_centimos }));

  return {
    citaId: cita.id,
    codigo: cita.id.slice(0, 8).toUpperCase(),
    fechaCitaISO: cita.inicio,
    pagadoAtISO: cita.pagado_at,
    sedeNombre: sede?.nombre ?? "Barbería Grasso",
    sedeDireccion: sede?.direccion ?? null,
    clienteId: cliente?.id ?? "",
    clienteNombre: cliente?.nombre ?? "Cliente",
    clienteTelefono: cliente?.telefono ?? null,
    profesionalNombre: profesional?.nombre ?? "Sin asignar",
    lineas,
    subtotalCentimos,
    descuentoCentimos,
    descuentoMotivo: cita.descuento_motivo,
    totalCentimos,
    pagadoConSaldoCentimos: cita.saldo_canjeado_centimos,
    metodoPago: cita.metodo_pago,
    pagosMixtos,
    anulado: cita.recibo_anulado_at
      ? { atISO: cita.recibo_anulado_at, por: cita.recibo_anulado_por, motivo: cita.recibo_anulado_motivo }
      : null,
  };
}

export const SELECT_CITA_RECIBO =
  "id, inicio, estado, pagado_at, metodo_pago, precio_final_centimos, saldo_canjeado_centimos, descuento_porcentaje, descuento_motivo, recibo_anulado_at, recibo_anulado_por, recibo_anulado_motivo, cliente:clientes(id, nombre, telefono), sede:sedes(nombre, direccion), profesional:profesionales(nombre), servicio:servicios(nombre, precio_centimos)";

/**
 * Trae y construye el recibo de UNA cita (panel de admin y envío por
 * WhatsApp). Devuelve null si la cita no existe o si no está
 * "completada" (una cita sin cobrar no tiene recibo).
 */
export async function obtenerDatosRecibo(supabase: SupabaseClient, citaId: string): Promise<DatosRecibo | null> {
  const { data: cita } = await supabase.from("citas").select(SELECT_CITA_RECIBO).eq("id", citaId).maybeSingle();
  if (!cita || (cita as unknown as CitaCruda).estado !== "completada") return null;

  const [{ data: extras }, { data: productos }, { data: pagos }] = await Promise.all([
    supabase.from("cita_extras").select("precio_centimos, servicio:servicios(nombre)").eq("cita_id", citaId),
    supabase.from("cita_productos").select("cantidad, precio_centimos, producto:productos(nombre)").eq("cita_id", citaId),
    supabase.from("cita_pagos").select("metodo, importe_centimos").eq("cita_id", citaId),
  ]);

  return construirRecibo({
    cita: cita as unknown as CitaCruda,
    extras: (extras ?? []) as unknown as ExtraCrudo[],
    productos: (productos ?? []) as unknown as ProductoCrudo[],
    pagos: (pagos ?? []) as unknown as PagoCrudo[],
  });
}

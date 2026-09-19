import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// Bonos: paquete de 4 usos de un servicio concreto (Corte o Corte y
// barba), vendido en el propio local y pagado de una sola vez — nunca
// se compra desde la app. Vale en cualquiera de las dos sedes y caduca
// al mes de comprarlo (ver supabase/anadir-bonos.sql, decisiones de
// Diego del 19/09/2026). Este archivo es la única fuente de verdad
// sobre "qué bono cubre esta cita" y "qué pasa al comprarlo o
// canjearlo" — mismo patrón que lib/precios.ts y lib/fidelizacion.ts.
// =====================================================================

export interface BonoTipo {
  id: string;
  clave: string;
  nombre: string;
  servicio_id: string;
  precio_centimos: number;
  usos_totales: number;
  dias_validez: number;
}

export interface Bono {
  id: string;
  cliente_id: string;
  bono_tipo_id: string;
  usos_totales: number;
  usos_restantes: number;
  precio_pagado_centimos: number;
  fecha_compra: string;
  fecha_caducidad: string;
}

export type BonoConTipo = Bono & { tipo: BonoTipo };

function hoyISO(hoy: Date = new Date()): string {
  return hoy.toISOString().slice(0, 10);
}

/** Un bono caducado deja de poder canjearse, pero sigue estando "vigente" para mostrarse — ver bonoEsUtilizable. */
export function bonoEstaVigente(bono: Pick<Bono, "fecha_caducidad">, hoy: Date = new Date()): boolean {
  return bono.fecha_caducidad >= hoyISO(hoy);
}

/**
 * Si este bono puede cubrir una cita hoy: le quedan usos y no ha
 * caducado. Un bono agotado o caducado NO se borra ni se oculta (pedido
 * explícito de Diego): se queda en el perfil del cliente como tarjeta,
 * simplemente deja de ser "utilizable".
 */
export function bonoEsUtilizable(bono: Pick<Bono, "usos_restantes" | "fecha_caducidad">, hoy: Date = new Date()): boolean {
  return bono.usos_restantes > 0 && bonoEstaVigente(bono, hoy);
}

/**
 * Los dos tipos de bono configurados, con su precio actual (editable
 * desde Mi barbería → Bonos). Lo usan tanto el selector de "vender bono
 * nuevo" del checkout como esa pantalla de precios.
 */
export async function listarBonoTipos(supabase: SupabaseClient): Promise<BonoTipo[]> {
  const { data, error } = await supabase.from("bonos_tipos").select("*").order("clave");
  if (error) throw new Error(error.message);
  return (data ?? []) as BonoTipo[];
}

function normalizarTipo(fila: { tipo: BonoTipo | BonoTipo[] | null }): BonoTipo {
  const tipo = Array.isArray(fila.tipo) ? fila.tipo[0] : fila.tipo;
  return tipo as BonoTipo;
}

/**
 * Todos los bonos de un cliente, más recientes primero — incluidos los
 * agotados o caducados. Se usa en su perfil (tarjetas de sello) y en el
 * checkout del panel para detectar si alguno cubre la cita que se está
 * cerrando.
 */
export async function bonosDelCliente(supabase: SupabaseClient, clienteId: string): Promise<BonoConTipo[]> {
  const { data, error } = await supabase
    .from("bonos")
    .select("*, tipo:bonos_tipos(*)")
    .eq("cliente_id", clienteId)
    .order("fecha_compra", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Bono & { tipo: BonoTipo | BonoTipo[] | null }>).map((fila) => ({
    ...fila,
    tipo: normalizarTipo(fila),
  }));
}

/**
 * El bono que cubriría un servicio concreto para este cliente ahora
 * mismo, si hay alguno — es lo que decide si el checkout ofrece
 * "Incluido en el bono" para esta cita (solo cuando el servicio elegido
 * es exactamente el del bono; los complementos nunca están incluidos y
 * se desglosan aparte). Si por lo que sea hubiera más de uno aplicable,
 * se usa el que caduca antes, para no dejar usos sin gastar por
 * descuido.
 */
export async function bonoAplicable(
  supabase: SupabaseClient,
  params: { clienteId: string; servicioId: string }
): Promise<BonoConTipo | null> {
  const bonos = await bonosDelCliente(supabase, params.clienteId);
  const candidatos = bonos.filter((b) => b.tipo?.servicio_id === params.servicioId && bonoEsUtilizable(b));
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => a.fecha_caducidad.localeCompare(b.fecha_caducidad));
  return candidatos[0];
}

/**
 * Vende un bono nuevo: se llama al completar la cita en la que el
 * barbero elige método de pago > bono > [tipo]. Nace ya con un uso
 * gastado, porque la propia cita de compra sella la primera casilla
 * (pedido explícito de Diego: "el primero de ellos sellado"). La fecha
 * de caducidad se calcula a partir de los días de validez del tipo en
 * el momento de la compra, así que cambiar el precio después nunca
 * afecta a bonos ya vendidos.
 */
export async function comprarBono(
  supabase: SupabaseClient,
  params: { clienteId: string; bonoTipoId: string }
): Promise<Bono> {
  const { data: tipo, error: errorTipo } = await supabase
    .from("bonos_tipos")
    .select("*")
    .eq("id", params.bonoTipoId)
    .single();
  if (errorTipo || !tipo) throw new Error("Tipo de bono no encontrado.");

  const hoy = new Date();
  const caducidad = new Date(hoy);
  caducidad.setDate(caducidad.getDate() + (tipo as BonoTipo).dias_validez);

  const { data, error } = await supabase
    .from("bonos")
    .insert({
      cliente_id: params.clienteId,
      bono_tipo_id: tipo.id,
      usos_totales: (tipo as BonoTipo).usos_totales,
      usos_restantes: (tipo as BonoTipo).usos_totales - 1,
      precio_pagado_centimos: (tipo as BonoTipo).precio_centimos,
      fecha_compra: hoyISO(hoy),
      fecha_caducidad: hoyISO(caducidad),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el bono.");
  return data as Bono;
}

/** Se lanza al canjear un bono que ya no tiene usos (carrera entre dos citas a la vez, doble clic, etc.) o que no existe. */
export class BonoNoDisponibleError extends Error {}

/**
 * Descuenta un uso de un bono ya existente, al completar una cita que
 * lo canjea (no la de compra, que resta su primer uso dentro de
 * comprarBono). Pasa por canjear_uso_bono() en Postgres, que bloquea la
 * fila mientras resta — igual que registrar_movimiento_saldo() hace con
 * el saldo de fidelización — para que dos citas del mismo bono
 * cerrándose casi a la vez nunca lo dejen en negativo.
 */
export async function canjearUsoBono(supabase: SupabaseClient, bonoId: string): Promise<Bono> {
  const { data, error } = await supabase.rpc("canjear_uso_bono", { p_bono_id: bonoId });
  if (error) throw new BonoNoDisponibleError(error.message);
  return data as Bono;
}

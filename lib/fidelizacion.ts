import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarError } from "@/lib/errorLog";
import { precioCitaCentimos } from "@/lib/precios";
import { CENTIMOS_POR_GRASSOCOIN } from "@/lib/grassocoins";

// =====================================================================
// Tarjeta de fidelidad: GrassoCoins (24/10/2026, sustituye al antiguo
// saldo del 10 % en euros).
//   * 1 GrassoCoin por cada 20 € pagados; lo que sobra se guarda para la
//     siguiente visita (ver lib/grassocoins.ts para las cuentas).
//   * Se ganan al cobrar la cita en el panel, nunca antes.
//   * Se canjean por servicios: cada servicio tiene un precio en coins
//     (servicios.coste_grassocoins). Canjear cubre la cita entera
//     (servicio + extras), y en ese caso la cita cuenta como "pagada con
//     fidelización" en recibos, informes y comisiones, igual que antes
//     con el saldo (saldo_canjeado_centimos = su valor en euros).
//   * Si una cita canjeada se cancela o no se presenta, se devuelven.
// Todo movimiento pasa por la función de base de datos
// registrar_movimiento_grassocoins() (supabase/anadir-grassocoins.sql),
// que es quien de verdad decide y deja constancia.
// =====================================================================

/** Se lanza cuando un canje no puede completarse porque ya no hay coins suficientes (p. ej. una carrera entre dos peticiones). */
export class GrassoCoinsInsuficientesError extends Error {}

export function formatearCentimos(centimos: number): string {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function esErrorDeDuplicado(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505");
}

export async function grassoCoinsDelCliente(supabase: SupabaseClient, clienteId: string): Promise<number> {
  const { data } = await supabase.from("clientes").select("grassocoins").eq("id", clienteId).single();
  return data?.grassocoins ?? 0;
}

interface ServicioConPrecio {
  precio_centimos: number;
}
interface ExtraConPrecio {
  precio_centimos: number;
}

/**
 * Total pagado en una cita ya guardada: precio del servicio + sus
 * complementos, salvo que el barbero haya corregido el precio final a
 * mano al cobrarla (precio_final_centimos, ver lib/precios.ts).
 */
export async function totalCitaCentimos(supabase: SupabaseClient, citaId: string): Promise<number> {
  const { data: cita } = await supabase
    .from("citas")
    .select("precio_final_centimos, servicio:servicios(precio_centimos), extras:cita_extras(precio_centimos)")
    .eq("id", citaId)
    .single();
  if (!cita) return 0;
  const servicioCrudo = (cita as { servicio: ServicioConPrecio | ServicioConPrecio[] | null }).servicio;
  const servicio = Array.isArray(servicioCrudo) ? servicioCrudo[0] : servicioCrudo;
  const extras = ((cita as { extras: ExtraConPrecio[] | null }).extras ?? []) as ExtraConPrecio[];
  const automatico = (servicio?.precio_centimos ?? 0) + extras.reduce((acc, e) => acc + e.precio_centimos, 0);
  return precioCitaCentimos((cita as { precio_final_centimos: number | null }).precio_final_centimos, automatico);
}

/**
 * Canjea coins al confirmar una reserva (llamado desde crearReserva en
 * lib/booking.ts). Si por una carrera ya no le alcanzan en el momento de
 * guardar, lanza GrassoCoinsInsuficientesError para que quien llama
 * deshaga la cita recién creada.
 */
export async function canjearGrassoCoinsEnCita(
  supabase: SupabaseClient,
  params: { clienteId: string; citaId: string; coins: number },
): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_movimiento_grassocoins", {
    p_cliente_id: params.clienteId,
    p_cita_id: params.citaId,
    p_tipo: "canje",
    p_coins: Math.abs(params.coins),
    p_creado_por: "sistema",
  });
  if (error) throw new GrassoCoinsInsuficientesError(error.message);
  return data as number;
}

/**
 * Se llama al cobrar una cita en el panel. Si la cita se pagó con
 * fidelización (coins o el saldo antiguo) no se gana nada: no hubo gasto
 * real. Nunca lanza — un fallo aquí no debe impedir cobrar — pero queda
 * registrado en errores_sistema para arreglarlo a mano si hiciera falta.
 */
export async function acumularPorCitaCompletada(
  supabase: SupabaseClient,
  cita: { id: string; cliente_id: string; saldo_canjeado_centimos?: number | null; grassocoins_canjeados?: number | null },
): Promise<void> {
  try {
    if ((cita.saldo_canjeado_centimos ?? 0) > 0 || (cita.grassocoins_canjeados ?? 0) > 0) return;
    const total = await totalCitaCentimos(supabase, cita.id);
    if (total <= 0) return;
    const { error } = await supabase.rpc("registrar_movimiento_grassocoins", {
      p_cliente_id: cita.cliente_id,
      p_cita_id: cita.id,
      p_tipo: "acumulacion",
      p_gasto_centimos: total,
      p_euros_por_coin_centimos: CENTIMOS_POR_GRASSOCOIN,
      p_creado_por: "sistema",
    });
    if (error) throw error;
  } catch (err) {
    // Ya se habían dado las coins de esta cita (p. ej. doble clic al
    // cobrar): el índice único evitó darlas dos veces.
    if (esErrorDeDuplicado(err)) return;
    await registrarError({
      origen: "fidelizacion",
      mensaje: "No se pudieron dar las GrassoCoins de una cita cobrada.",
      detalle: { citaId: cita.id, err },
    });
  }
}

/**
 * Se llama al cancelar una cita o marcarla "no presentada". Si se había
 * canjeado con coins, se devuelven íntegras: cancelar o faltar no le
 * cuesta al cliente las coins que ya tenía ganadas. Nunca lanza.
 */
export async function reembolsarGrassoCoinsDeCita(
  supabase: SupabaseClient,
  cita: { id: string; cliente_id: string; grassocoins_canjeados?: number | null },
): Promise<void> {
  try {
    const coins = cita.grassocoins_canjeados ?? 0;
    if (coins <= 0) return;
    const { error } = await supabase.rpc("registrar_movimiento_grassocoins", {
      p_cliente_id: cita.cliente_id,
      p_cita_id: cita.id,
      p_tipo: "reembolso",
      p_coins: coins,
      p_creado_por: "sistema",
    });
    if (error) throw error;
  } catch (err) {
    if (esErrorDeDuplicado(err)) return;
    await registrarError({
      origen: "fidelizacion",
      mensaje: "No se pudieron devolver las GrassoCoins de una cita cancelada/no presentada.",
      detalle: { citaId: cita.id, err },
    });
  }
}

/**
 * Ajuste manual desde la ficha del cliente en el panel (un detalle
 * comercial o corregir un error). Este SÍ deja subir el error: si se
 * intenta restar más coins de las que tiene, el barbero tiene que verlo.
 */
export async function ajustarGrassoCoinsManual(
  supabase: SupabaseClient,
  params: { clienteId: string; coins: number; nota: string; creadoPor: string },
): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_movimiento_grassocoins", {
    p_cliente_id: params.clienteId,
    p_cita_id: null,
    p_tipo: "ajuste_manual",
    p_coins: params.coins,
    p_nota: params.nota || null,
    p_creado_por: params.creadoPor,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

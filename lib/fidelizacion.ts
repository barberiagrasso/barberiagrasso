import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarError } from "@/lib/errorLog";
import { precioCitaCentimos } from "@/lib/precios";

// =====================================================================
// Programa de fidelización: 10% de lo gastado en cada cita se acumula
// como saldo, canjeable después por cualquier servicio en cualquiera de
// las dos sedes SIEMPRE que el saldo cubra el total (no se admite canje
// parcial). Todo movimiento pasa por la función de base de datos
// registrar_movimiento_saldo() (ver supabase/actualizar-fidelizacion.sql),
// que es quien de verdad decide y deja constancia — este archivo es solo
// la capa de más alto nivel que decide CUÁNDO se llama a esa función y
// con qué importe.
// =====================================================================

export const PORCENTAJE_FIDELIZACION = 0.1;

/** Se lanza cuando un canje no puede completarse porque el saldo ya no alcanza (p. ej. una carrera entre dos peticiones). */
export class SaldoInsuficienteError extends Error {}

/**
 * Cuánto saldo genera un importe realmente pagado (en efectivo/tarjeta).
 * Redondeo al céntimo más cercano: nunca se generan fracciones de
 * céntimo que no existen en el mundo real.
 */
export function calcularAcumulacionCentimos(totalPagadoCentimos: number): number {
  if (!Number.isFinite(totalPagadoCentimos) || totalPagadoCentimos <= 0) return 0;
  return Math.round(totalPagadoCentimos * PORCENTAJE_FIDELIZACION);
}

export function formatearCentimos(centimos: number): string {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function esErrorDeDuplicado(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505");
}

export async function saldoDelCliente(supabase: SupabaseClient, clienteId: string): Promise<number> {
  const { data } = await supabase
    .from("clientes")
    .select("saldo_fidelizacion_centimos")
    .eq("id", clienteId)
    .single();
  return data?.saldo_fidelizacion_centimos ?? 0;
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
 * mano al cerrarla (precio_final_centimos, ver lib/precios.ts) — en ese
 * caso manda ese número. Es el mismo cálculo que ya usa app/perfil/page.tsx
 * para enseñar el historial al cliente — aquí centralizado para que el
 * saldo que se acumula use exactamente el mismo número.
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
 * Canjea saldo al confirmar una reserva (llamado desde crearReserva,
 * dentro de lib/booking.ts, cuando el cliente elige pagar con saldo). Se
 * apoya en el índice único de saldo_fidelizacion_movimientos y en la
 * comprobación de saldo>=0 dentro de registrar_movimiento_saldo(): si por
 * una carrera el saldo ya no alcanza en el momento exacto de guardar,
 * lanza SaldoInsuficienteError para que quien llama pueda deshacer la
 * cita recién creada y avisar al cliente, en vez de dejarla a medio
 * pagar.
 */
export async function canjearSaldoEnCita(
  supabase: SupabaseClient,
  params: { clienteId: string; citaId: string; importeCentimos: number }
): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_movimiento_saldo", {
    p_cliente_id: params.clienteId,
    p_cita_id: params.citaId,
    p_tipo: "canje",
    p_importe_centimos: -Math.abs(params.importeCentimos),
    p_nota: null,
    p_creado_por: "sistema",
  });
  if (error) throw new SaldoInsuficienteError(error.message);
  return data as number;
}

/**
 * Se llama al marcar una cita como "completada" desde el panel (el único
 * sitio donde esto ocurre — ver app/api/admin/citas/[id]/route.ts). Si la
 * cita se pagó con saldo no se acumula nada (no hubo gasto real que
 * recompensar: sería fidelizar con el propio saldo del cliente). Nunca
 * lanza — un fallo aquí no debe impedir que la cita quede marcada como
 * completada — pero sí queda registrado en errores_sistema para poder
 * arreglarlo a mano desde /admin/clientes si hiciera falta.
 */
export async function acumularPorCitaCompletada(
  supabase: SupabaseClient,
  cita: { id: string; cliente_id: string; saldo_canjeado_centimos: number }
): Promise<void> {
  try {
    if (cita.saldo_canjeado_centimos > 0) return;
    const total = await totalCitaCentimos(supabase, cita.id);
    const importe = calcularAcumulacionCentimos(total);
    if (importe <= 0) return;
    const { error } = await supabase.rpc("registrar_movimiento_saldo", {
      p_cliente_id: cita.cliente_id,
      p_cita_id: cita.id,
      p_tipo: "acumulacion",
      p_importe_centimos: importe,
      p_nota: null,
      p_creado_por: "sistema",
    });
    if (error) throw error;
  } catch (err) {
    // Ya había un movimiento de acumulación para esta cita (p. ej. un
    // doble clic en el panel marcándola completada dos veces): el índice
    // único ya evitó la doble acumulación, que es justo lo que se quería.
    if (esErrorDeDuplicado(err)) return;
    await registrarError({
      origen: "fidelizacion",
      mensaje: "No se pudo acumular saldo de fidelización de una cita completada.",
      detalle: { citaId: cita.id, err },
    });
  }
}

/**
 * Se llama al cancelar una cita o marcarla "no presentada" (ver
 * cancelarCita() en lib/booking.ts y el PATCH de
 * app/api/admin/citas/[id]/route.ts). Si la cita se había pagado con
 * saldo, se lo devuelve íntegro al cliente — política deliberadamente
 * no punitiva: cancelar o faltar a una cita no debe costarle el saldo
 * que ya tenía ganado. Nunca lanza, por la misma razón que
 * acumularPorCitaCompletada.
 */
export async function reembolsarSaldoDeCita(
  supabase: SupabaseClient,
  cita: { id: string; cliente_id: string; saldo_canjeado_centimos: number }
): Promise<void> {
  try {
    if (cita.saldo_canjeado_centimos <= 0) return;
    const { error } = await supabase.rpc("registrar_movimiento_saldo", {
      p_cliente_id: cita.cliente_id,
      p_cita_id: cita.id,
      p_tipo: "reembolso",
      p_importe_centimos: cita.saldo_canjeado_centimos,
      p_nota: null,
      p_creado_por: "sistema",
    });
    if (error) throw error;
  } catch (err) {
    if (esErrorDeDuplicado(err)) return;
    await registrarError({
      origen: "fidelizacion",
      mensaje: "No se pudo reembolsar el saldo canjeado de una cita cancelada/no presentada.",
      detalle: { citaId: cita.id, err },
    });
  }
}

/**
 * Ajuste manual desde /admin/clientes (un barbero corrige el saldo de un
 * cliente a mano — por ejemplo, un detalle comercial o para arreglar un
 * error). A diferencia de los movimientos automáticos, este SÍ deja que
 * el error suba a quien llama: si el barbero pide restar más saldo del
 * que hay, tiene que verlo en el panel, no que falle en silencio.
 */
export async function ajustarSaldoManual(
  supabase: SupabaseClient,
  params: { clienteId: string; importeCentimos: number; nota: string; creadoPor: string }
): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_movimiento_saldo", {
    p_cliente_id: params.clienteId,
    p_cita_id: null,
    p_tipo: "ajuste_manual",
    p_importe_centimos: params.importeCentimos,
    p_nota: params.nota || null,
    p_creado_por: params.creadoPor,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

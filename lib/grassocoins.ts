// =====================================================================
// GrassoCoins — cálculos puros, sin base de datos (24/10/2026).
//
// Vive aparte de lib/fidelizacion.ts (que es "server-only") para que la
// reserva, la tarjeta y el panel puedan usar exactamente las mismas
// cuentas en el navegador que el servidor al apuntarlas.
// =====================================================================

/**
 * 1 GrassoCoin por cada euro pagado (decisión de Diego, 24/10/2026): es
 * proporcional a lo que deja cada cliente, sea un corte de 12 € o un ticket
 * de 40 €. Lo generoso que es el programa se controla con el precio en
 * coins de cada servicio (panel → Servicios), no con esta regla.
 */
export const EUROS_POR_GRASSOCOIN = 1;
export const CENTIMOS_POR_GRASSOCOIN = EUROS_POR_GRASSOCOIN * 100;

export const NOMBRE_GRASSOCOINS = "GrassoCoins";

/** "1 GrassoCoin" / "3 GrassoCoins". */
export function formatearGrassoCoins(coins: number): string {
  return `${coins} ${coins === 1 ? "GrassoCoin" : "GrassoCoins"}`;
}

/**
 * Cuántas coins se ganan con un pago y cuánto queda guardado para la
 * próxima, sumando lo que ya había guardado de visitas anteriores. Es la
 * misma cuenta que hace la base de datos en registrar_movimiento_grassocoins().
 *   resto 0 + 12,80 € → 12 coins, quedan 0,80 €
 *   resto 0,80 € + 14,20 € → 15 coins, quedan 0 €
 */
export function calcularGrassoCoins(
  restoCentimos: number,
  gastoCentimos: number,
): { coins: number; restoCentimos: number } {
  const resto = Number.isFinite(restoCentimos) && restoCentimos > 0 ? Math.floor(restoCentimos) : 0;
  const gasto = Number.isFinite(gastoCentimos) && gastoCentimos > 0 ? Math.round(gastoCentimos) : 0;
  const total = resto + gasto;
  return {
    coins: Math.floor(total / CENTIMOS_POR_GRASSOCOIN),
    restoCentimos: total % CENTIMOS_POR_GRASSOCOIN,
  };
}

/** Euros (en céntimos) que le faltan al cliente para su siguiente coin. */
export function centimosParaSiguienteCoin(restoCentimos: number): number {
  const resto = Number.isFinite(restoCentimos) && restoCentimos > 0 ? restoCentimos % CENTIMOS_POR_GRASSOCOIN : 0;
  return CENTIMOS_POR_GRASSOCOIN - resto;
}

/** Progreso hacia la siguiente coin, de 0 a 1 (para la barrita de la tarjeta). */
export function progresoSiguienteCoin(restoCentimos: number): number {
  return 1 - centimosParaSiguienteCoin(restoCentimos) / CENTIMOS_POR_GRASSOCOIN;
}

/**
 * Coins que cuesta canjear una cita entera: el servicio más cada extra
 * elegido. Si alguno no tiene precio en coins (coste_grassocoins vacío),
 * la cita no se puede canjear y devuelve null.
 */
export function costeGrassoCoinsCita(
  servicio: { coste_grassocoins?: number | null } | null | undefined,
  extras: { coste_grassocoins?: number | null }[] = [],
): number | null {
  const items = [servicio, ...extras];
  let total = 0;
  for (const item of items) {
    const coste = item?.coste_grassocoins;
    if (!coste || coste <= 0) return null;
    total += coste;
  }
  return total;
}

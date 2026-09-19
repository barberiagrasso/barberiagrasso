// Un único sitio que decide "cuánto costó de verdad esta cita" — para que
// comisiones, fidelización, HubSpot y el historial del cliente usen
// siempre el mismo número.

/**
 * Precio final de una cita ya cerrada: si el barbero lo corrigió a mano
 * al finalizarla (citas.precio_final_centimos, desde el checkout del
 * modal "Finalizar cita"), ese es el importe que cuenta en todas partes.
 * Si no se tocó nada (el caso normal, precioFinalCentimos es null/undefined),
 * se usa el cálculo automático de siempre: precio del servicio + sus
 * complementos.
 */
export function precioCitaCentimos(
  precioFinalCentimos: number | null | undefined,
  precioAutomaticoCentimos: number
): number {
  return typeof precioFinalCentimos === "number" ? precioFinalCentimos : precioAutomaticoCentimos;
}

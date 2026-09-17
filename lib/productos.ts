// Lógica pura del catálogo de productos y su comisión — sin "server-only"
// a propósito, igual que lib/comisiones.ts: la usan tanto rutas de
// servidor como el propio panel (para totales en vivo al cerrar una
// cita).

export interface Producto {
  id: string;
  nombre: string;
  // Agrupa el catálogo en el selector del panel — solo organización
  // visual, no afecta a ningún cálculo.
  categoria: string | null;
  precioCentimos: number;
  orden: number;
  activo: boolean;
}

/**
 * Comisión sobre la venta de productos de un barbero en un mes: a
 * diferencia de la comisión por servicios (con tramos), aquí se aplica
 * un ÚNICO porcentaje plano sobre TODO lo vendido, desde el primer euro
 * — no hay tramos ni un umbral mínimo. Redondeo al céntimo más cercano.
 */
export function calcularComisionProductos(totalProductosCentimos: number, porcentaje: number): number {
  if (!Number.isFinite(totalProductosCentimos) || totalProductosCentimos <= 0) return 0;
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  return Math.round((totalProductosCentimos * porcentaje) / 100);
}

/** Valida el porcentaje plano de comisión de productos antes de guardarlo. */
export function validarPorcentajeProductos(porcentaje: number): string | null {
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return "El porcentaje debe estar entre 0 y 100.";
  }
  return null;
}

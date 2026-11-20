// Cálculos puros del stock por sede (ver supabase/anadir-stock-por-sede.sql).
// Sin "server-only": los usan la API y la propia pantalla de Stock.

export type EstadoStock = "agotado" | "pedir" | "ok";

/** Unidades a pedir: si el stock está en el mínimo o por debajo, hasta llegar a la cantidad ideal. */
export function unidadesAPedir(stock: number, minimo: number, ideal: number): number {
  if (stock > minimo) return 0;
  return Math.max(0, ideal - stock);
}

export function estadoStock(stock: number, minimo: number): EstadoStock {
  if (stock <= 0) return "agotado";
  if (stock <= minimo) return "pedir";
  return "ok";
}

/** Texto para mandar el pedido por WhatsApp o email. */
export function textoPedido(sede: string, lineas: { nombre: string; unidades: number }[]): string {
  const filas = lineas.filter((l) => l.unidades > 0).map((l) => `• ${l.nombre}: ${l.unidades}`);
  if (filas.length === 0) return `Pedido Barbería Grasso — ${sede}: no hace falta pedir nada.`;
  return [`Pedido Barbería Grasso — ${sede}`, ...filas].join("\n");
}

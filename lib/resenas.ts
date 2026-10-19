import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ValoracionAgregada {
  media: number; // 1-5, redondeado a 1 decimal
  total: number;
}

// Media y nº de valoraciones agrupadas por una columna (profesional_id o
// sede_id) — para enseñar "★ 4.8 (23)" junto a un profesional o una
// sede, como hace Booksy en su ficha de negocio (pedido de Diego,
// 19/10/2026). Un solo viaje a la base de datos para varios ids a la
// vez, así se puede pedir para toda una lista de profesionales de un
// tirón en vez de una consulta por cada uno.
export async function valoracionesPorColumna(
  supabase: SupabaseClient,
  columna: "profesional_id" | "sede_id",
  ids: string[],
): Promise<Map<string, ValoracionAgregada>> {
  const resultado = new Map<string, ValoracionAgregada>();
  if (ids.length === 0) return resultado;

  const { data } = await supabase.from("resenas").select(`${columna}, estrellas`).in(columna, ids);

  const sumaPorId = new Map<string, number>();
  const totalPorId = new Map<string, number>();
  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    const id = fila[columna] as string | null;
    const estrellas = fila.estrellas as number;
    if (!id) continue;
    sumaPorId.set(id, (sumaPorId.get(id) ?? 0) + estrellas);
    totalPorId.set(id, (totalPorId.get(id) ?? 0) + 1);
  }
  for (const [id, total] of totalPorId) {
    const suma = sumaPorId.get(id) ?? 0;
    resultado.set(id, { media: Math.round((suma / total) * 10) / 10, total });
  }
  return resultado;
}

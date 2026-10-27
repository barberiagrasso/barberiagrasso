import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// Portafolio de trabajos y notas de Booksy/Google por sede (27/10/2026).
// Ver supabase/anadir-portafolio-y-resenas.sql.
//
// Todas las lecturas de aquí "fallan en silencio" (devuelven vacío) si
// las tablas todavía no existen o la consulta falla: el portafolio y las
// notas son un extra de la app y nunca deben tumbar la reserva ni la
// portada.
// =====================================================================

export const BUCKET_PORTAFOLIO = "portafolio";

export interface FotoPortafolio {
  id: string;
  url: string;
  servicio_id: string | null;
  sede_id: string | null;
  descripcion: string | null;
  created_at: string;
}

export interface ResenaExterna {
  url: string | null;
  url_escribir: string | null;
  nota: number | null;
  total: number | null;
}

export interface ResenasExternasSede {
  booksy?: ResenaExterna;
  google?: ResenaExterna;
}

export async function cargarFotosPortafolio(
  supabase: SupabaseClient,
  opciones: { servicioId?: string | null; limite?: number } = {},
): Promise<FotoPortafolio[]> {
  try {
    let consulta = supabase
      .from("portafolio_fotos")
      .select("id, url, servicio_id, sede_id, descripcion, created_at")
      .order("created_at", { ascending: false })
      .limit(opciones.limite ?? 300);
    if (opciones.servicioId) consulta = consulta.eq("servicio_id", opciones.servicioId);
    const { data, error } = await consulta;
    if (error) return [];
    return (data ?? []) as FotoPortafolio[];
  } catch {
    return [];
  }
}

/** Cuántas fotos tiene cada servicio (para enseñar "Ver trabajos" solo donde hay). */
export async function contarFotosPorServicio(supabase: SupabaseClient): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.from("portafolio_fotos").select("servicio_id").not("servicio_id", "is", null);
    if (error) return {};
    const cuenta: Record<string, number> = {};
    for (const fila of (data ?? []) as { servicio_id: string }[]) {
      cuenta[fila.servicio_id] = (cuenta[fila.servicio_id] ?? 0) + 1;
    }
    return cuenta;
  } catch {
    return {};
  }
}

export async function cargarResenasExternas(supabase: SupabaseClient): Promise<Record<string, ResenasExternasSede>> {
  try {
    const { data, error } = await supabase
      .from("sede_resenas_externas")
      .select("sede_id, fuente, url, url_escribir, nota, total");
    if (error) return {};
    const porSede: Record<string, ResenasExternasSede> = {};
    for (const fila of (data ?? []) as ({ sede_id: string; fuente: "booksy" | "google" } & ResenaExterna)[]) {
      porSede[fila.sede_id] ??= {};
      porSede[fila.sede_id][fila.fuente] = {
        url: fila.url,
        url_escribir: fila.url_escribir,
        nota: fila.nota === null ? null : Number(fila.nota),
        total: fila.total,
      };
    }
    return porSede;
  } catch {
    return {};
  }
}

/** Solo acepta enlaces https (evita guardar "javascript:" u otras cosas raras como enlace). */
export function limpiarUrl(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  try {
    const url = new URL(texto);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

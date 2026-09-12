import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SegmentoCampana } from "@/lib/types";

export interface ClienteSegmento {
  id: string;
  nombre: string;
  telefono: string;
}

/**
 * Calcula qué clientes entran en un segmento de campaña. Por seguridad,
 * SIEMPRE excluye a quien no tenga el consentimiento comercial activo,
 * se marque o no ese filtro explícitamente: nunca se debe poder mandar
 * una campaña a alguien que no ha aceptado recibir comunicaciones.
 */
export async function resolverSegmento(segmento: SegmentoCampana): Promise<ClienteSegmento[]> {
  const supabase = createAdminClient();

  let query = supabase.from("clientes").select("id, nombre, telefono, etiquetas, sede_habitual_id");
  if (segmento.sedeHabitualId) query = query.eq("sede_habitual_id", segmento.sedeHabitualId);
  if (segmento.etiqueta) query = query.contains("etiquetas", [segmento.etiqueta]);

  const { data: clientes } = await query;
  let candidatos = clientes ?? [];

  const ids = candidatos.map((c) => c.id);
  const { data: consentimientos } = await supabase
    .from("consentimientos")
    .select("cliente_id")
    .eq("tipo", "comercial")
    .eq("estado", "activo")
    .in("cliente_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const idsConConsentimiento = new Set((consentimientos ?? []).map((c) => c.cliente_id));
  candidatos = candidatos.filter((c) => idsConConsentimiento.has(c.id));

  if (segmento.sinVisitasDesde) {
    const idsCandidatos = candidatos.map((c) => c.id);
    const { data: citasRecientes } = await supabase
      .from("citas")
      .select("cliente_id")
      .eq("estado", "completada")
      .gte("inicio", new Date(segmento.sinVisitasDesde).toISOString())
      .in("cliente_id", idsCandidatos.length ? idsCandidatos : ["00000000-0000-0000-0000-000000000000"]);
    const idsConVisitaReciente = new Set((citasRecientes ?? []).map((c) => c.cliente_id));
    candidatos = candidatos.filter((c) => !idsConVisitaReciente.has(c.id));
  }

  return candidatos.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }));
}

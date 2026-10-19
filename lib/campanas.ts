import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";

export class CampanaError extends Error {}

/**
 * Manda una campaña a todos sus destinatarios pendientes. Extraído de
 * app/api/admin/campanas/[id]/enviar/route.ts (que lo sigue llamando
 * igual, sin cambiar su comportamiento) para que también lo pueda usar
 * /api/cron/campanas-programadas — así una campaña programada para una
 * hora concreta ("mándala mañana a las 10") se manda exactamente igual
 * que si Diego hubiera pulsado "Enviar" a mano a esa hora, sin duplicar
 * la lógica en dos sitios que se puedan desincronizar.
 */
export async function enviarCampanaAhora(
  supabase: SupabaseClient,
  campanaId: string
): Promise<{ enviados: number; fallidos: number }> {
  const { data: campana } = await supabase
    .from("campanas")
    .select("*, plantilla:plantillas_whatsapp(*)")
    .eq("id", campanaId)
    .single();
  if (!campana) throw new CampanaError("No encontrada.");
  if (!campana.plantilla) throw new CampanaError("Esta campaña no tiene una plantilla aprobada asignada.");
  if (!campana.plantilla.activa) throw new CampanaError("La plantilla asignada está desactivada.");
  if (campana.estado === "enviando" || campana.estado === "enviada") {
    throw new CampanaError("Esta campaña ya se envió o se está enviando.");
  }
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new CampanaError("WhatsApp Business todavía no está conectado (variables de entorno).");
  }

  await supabase.from("campanas").update({ estado: "enviando" }).eq("id", campanaId);

  const { data: destinatarios } = await supabase
    .from("campana_destinatarios")
    .select("cliente_id, cliente:clientes(nombre, telefono)")
    .eq("campana_id", campanaId)
    .eq("estado", "pendiente");

  let enviados = 0;
  let fallidos = 0;

  for (const d of destinatarios ?? []) {
    const cliente = Array.isArray(d.cliente) ? d.cliente[0] : d.cliente;
    if (!cliente) continue;
    try {
      const variables = resolverVariablesPlantilla(campana.plantilla.variables ?? [], {
        nombre: cliente.nombre,
        mensaje: campana.mensaje,
      });
      await sendWhatsAppTemplate(cliente.telefono, campana.plantilla.nombre_meta, campana.plantilla.idioma, variables);
      await supabase
        .from("campana_destinatarios")
        .update({ estado: "enviado", enviado_at: new Date().toISOString() })
        .eq("campana_id", campanaId)
        .eq("cliente_id", d.cliente_id);
      enviados++;
    } catch (err) {
      await supabase
        .from("campana_destinatarios")
        .update({ estado: "fallido", error: err instanceof Error ? err.message : "Error desconocido" })
        .eq("campana_id", campanaId)
        .eq("cliente_id", d.cliente_id);
      fallidos++;
    }
  }

  const { count: pendientesRestantes } = await supabase
    .from("campana_destinatarios")
    .select("*", { count: "exact", head: true })
    .eq("campana_id", campanaId)
    .eq("estado", "pendiente");

  const estadoFinal = pendientesRestantes && pendientesRestantes > 0 ? "fallida" : fallidos > 0 && enviados === 0 ? "fallida" : "enviada";
  await supabase.from("campanas").update({ estado: estadoFinal, enviada_at: new Date().toISOString() }).eq("id", campanaId);

  return { enviados, fallidos };
}

import { NextRequest, NextResponse } from "next/server";
import { requireRolAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manda la campaña a todos sus destinatarios pendientes, usando la
// plantilla aprobada asignada. Solo se puede llamar una vez por campaña
// en estado "borrador" (o "fallida", para reintentar solo los pendientes
// que quedaron sin enviar). Marca cada destinatario como enviado/fallido
// para poder ver el resultado en el panel.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRolAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: campana } = await supabase
    .from("campanas")
    .select("*, plantilla:plantillas_whatsapp(*)")
    .eq("id", id)
    .single();
  if (!campana) return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  if (!campana.plantilla) {
    return NextResponse.json({ error: "Esta campaña no tiene una plantilla aprobada asignada." }, { status: 400 });
  }
  if (!campana.plantilla.activa) {
    return NextResponse.json({ error: "La plantilla asignada está desactivada." }, { status: 400 });
  }
  if (campana.estado === "enviando" || campana.estado === "enviada") {
    return NextResponse.json({ error: "Esta campaña ya se envió o se está enviando." }, { status: 400 });
  }
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return NextResponse.json({ error: "WhatsApp Business todavía no está conectado (variables de entorno)." }, { status: 400 });
  }

  await supabase.from("campanas").update({ estado: "enviando" }).eq("id", id);

  const { data: destinatarios } = await supabase
    .from("campana_destinatarios")
    .select("cliente_id, cliente:clientes(nombre, telefono)")
    .eq("campana_id", id)
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
        .eq("campana_id", id)
        .eq("cliente_id", d.cliente_id);
      enviados++;
    } catch (err) {
      await supabase
        .from("campana_destinatarios")
        .update({ estado: "fallido", error: err instanceof Error ? err.message : "Error desconocido" })
        .eq("campana_id", id)
        .eq("cliente_id", d.cliente_id);
      fallidos++;
    }
  }

  const { count: pendientesRestantes } = await supabase
    .from("campana_destinatarios")
    .select("*", { count: "exact", head: true })
    .eq("campana_id", id)
    .eq("estado", "pendiente");

  const estadoFinal = pendientesRestantes && pendientesRestantes > 0 ? "fallida" : fallidos > 0 && enviados === 0 ? "fallida" : "enviada";
  await supabase.from("campanas").update({ estado: estadoFinal, enviada_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ ok: true, enviados, fallidos });
}

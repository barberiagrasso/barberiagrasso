import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/booking";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { ejecutarAsistente } from "@/lib/aiAssistant";

export const dynamic = "force-dynamic";

// Paso de verificación que pide Meta al configurar el webhook (Meta for
// Developers → tu app → WhatsApp → Configuration → Webhook).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verificación fallida", { status: 403 });
}

// Mensajes entrantes de WhatsApp.
export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);

  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const mensajeEntrante = value?.messages?.[0];

    // Ignora notificaciones que no son mensajes de texto entrantes
    // (confirmaciones de entrega/lectura, otros tipos de contenido...).
    // Es un buen punto para ampliar más adelante (audio, imágenes, botones).
    if (!mensajeEntrante || mensajeEntrante.type !== "text") {
      return NextResponse.json({ ok: true });
    }

    const telefono = normalizarTelefono(mensajeEntrante.from);
    const texto = mensajeEntrante.text.body as string;
    const nombreContacto = value?.contacts?.[0]?.profile?.name as string | undefined;

    const supabase = createAdminClient();

    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefono", telefono)
      .maybeSingle();

    let { data: conversacion } = await supabase
      .from("conversaciones")
      .select("id, estado")
      .eq("telefono", telefono)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversacion) {
      const { data: nuevaConversacion } = await supabase
        .from("conversaciones")
        .insert({ telefono, cliente_id: clienteExistente?.id ?? null, estado: "ia" })
        .select("id, estado")
        .single();
      conversacion = nuevaConversacion;
    }

    if (!conversacion) {
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    await supabase.from("mensajes").insert({
      conversacion_id: conversacion.id,
      remitente: "cliente",
      contenido: texto,
    });
    await supabase
      .from("conversaciones")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversacion.id);

    // Si ya está escalada a una persona, no contesta la IA: solo queda
    // registrado para que el gestor lo vea en el panel (sección
    // "WhatsApp" del panel de control).
    if (conversacion.estado === "escalada") {
      return NextResponse.json({ ok: true });
    }

    const { data: historialCrudo } = await supabase
      .from("mensajes")
      .select("remitente, contenido")
      .eq("conversacion_id", conversacion.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const historial = (historialCrudo ?? []).slice(0, -1); // sin el mensaje que acabamos de insertar

    const { respuesta, escalar } = await ejecutarAsistente({
      conversacionId: conversacion.id,
      telefono,
      historial,
      mensajeNuevo: nombreContacto ? `[${nombreContacto}] ${texto}` : texto,
    });

    await supabase.from("mensajes").insert({
      conversacion_id: conversacion.id,
      remitente: "ia",
      contenido: respuesta,
    });

    if (escalar) {
      await supabase.from("conversaciones").update({ estado: "escalada" }).eq("id", conversacion.id);
    }

    await sendWhatsAppMessage(telefono, respuesta);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error procesando webhook de WhatsApp", err);
    // Devolvemos 200 igualmente: si respondemos con error, Meta reintenta
    // el mismo mensaje varias veces y puede duplicar respuestas.
    return NextResponse.json({ ok: false });
  }
}

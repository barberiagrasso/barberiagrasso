import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: conversacion }, { data: mensajes }] = await Promise.all([
    supabase.from("conversaciones").select("id, telefono, estado, cliente:clientes(nombre)").eq("id", id).single(),
    supabase.from("mensajes").select("id, remitente, contenido, created_at").eq("conversacion_id", id).order("created_at"),
  ]);

  return NextResponse.json({ conversacion, mensajes: mensajes ?? [] });
}

// El gestor responde manualmente: se envía por WhatsApp y la conversación
// queda marcada como "escalada" (atendida por una persona), para que la
// IA no vuelva a contestar automáticamente por encima.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.contenido) return NextResponse.json({ error: "Falta el contenido del mensaje." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: conversacion } = await supabase.from("conversaciones").select("telefono").eq("id", id).single();
  if (!conversacion) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

  await supabase.from("mensajes").insert({ conversacion_id: id, remitente: "gestor", contenido: body.contenido });
  await supabase.from("conversaciones").update({ estado: "escalada", updated_at: new Date().toISOString() }).eq("id", id);
  await sendWhatsAppMessage(conversacion.telefono, body.contenido);

  return NextResponse.json({ ok: true });
}

// Cambiar el estado manualmente: devolver el control a la IA, o cerrar.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.estado) return NextResponse.json({ error: "Falta el estado." }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("conversaciones").update({ estado: body.estado }).eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

function formatoHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

// Botón "Avisar que ya estoy disponible" dentro de una cita, para cuando
// el barbero termina antes de lo previsto: busca la SIGUIENTE cita
// confirmada de ESE MISMO profesional ese mismo día (la que empieza
// justo después de esta) y le manda un WhatsApp por si quiere venir
// antes. No toca el estado de ninguna cita — es solo un aviso.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: citaActual } = await supabase
    .from("citas")
    .select("id, sede_id, profesional_id, inicio, fin, estado")
    .eq("id", id)
    .maybeSingle();

  if (!citaActual) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  if (citaActual.estado === "cancelada" || citaActual.estado === "no_presentada") {
    return NextResponse.json({ error: "Esta cita no está activa." }, { status: 409 });
  }
  if (!citaActual.profesional_id) {
    return NextResponse.json({ error: "Esta cita no tiene un profesional asignado." }, { status: 409 });
  }

  // La siguiente cita confirmada de ese mismo profesional, ese mismo día,
  // que empiece después de esta — es a quien avisamos.
  const finDelDia = `${citaActual.inicio.slice(0, 10)}T23:59:59`;
  const { data: siguiente } = await supabase
    .from("citas")
    .select("id, inicio, cliente:clientes(nombre, telefono), sede:sedes(nombre)")
    .eq("profesional_id", citaActual.profesional_id)
    .eq("sede_id", citaActual.sede_id)
    .eq("estado", "confirmada")
    .gt("inicio", citaActual.fin)
    .lte("inicio", finDelDia)
    .order("inicio", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!siguiente) {
    return NextResponse.json({ error: "No hay ninguna cita después de esta hoy con este profesional." }, { status: 404 });
  }

  const cliente = Array.isArray(siguiente.cliente) ? siguiente.cliente[0] : siguiente.cliente;
  const sede = Array.isArray(siguiente.sede) ? siguiente.sede[0] : siguiente.sede;
  if (!cliente?.telefono) {
    return NextResponse.json({ error: "El siguiente cliente no tiene teléfono registrado." }, { status: 409 });
  }

  const nombrePila = cliente.nombre?.split(" ")[0] || "";
  const mensaje =
    `¡Hola${nombrePila ? " " + nombrePila : ""}! Tu barbero en Barbería Grasso` +
    (sede?.nombre ? ` (${sede.nombre})` : "") +
    ` ya está disponible antes de lo previsto. Si quieres, puedes acercarte ya — si prefieres mantener tu hora de las ${formatoHora(
      siguiente.inicio
    )}, no hace falta que hagas nada.`;

  try {
    await sendWhatsAppMessage(cliente.telefono, mensaje);
  } catch (err) {
    await registrarError({
      origen: "aviso_disponibilidad",
      mensaje: `No se pudo avisar a ${cliente.nombre ?? "un cliente"} de que el profesional ya está disponible.`,
      detalle: err,
    });
    return NextResponse.json(
      { error: "No se pudo enviar el WhatsApp (puede que hayan pasado más de 24h desde su último mensaje). Llámale si es urgente." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, clienteNombre: cliente.nombre ?? "el cliente" });
}

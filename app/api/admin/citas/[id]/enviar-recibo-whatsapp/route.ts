import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerDatosRecibo, etiquetaMetodoPago } from "@/lib/recibo";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { registrarError } from "@/lib/errorLog";
import { euros } from "@/lib/formato";

export const dynamic = "force-dynamic";

function formatoFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

/**
 * Manda el recibo de una cita ya cobrada por WhatsApp al cliente (pedido
 * de Diego, 25/09/2026 — alternativa a montar un envío por email, que
 * esta app no tenía configurado: reutiliza el WhatsApp de negocio que ya
 * usan los recordatorios). Texto libre, así que solo funciona dentro de
 * la ventana de 24h desde el último mensaje del cliente (ver
 * lib/whatsapp.ts) — si falla por eso, el recibo sigue quedando
 * disponible igualmente para el propio cliente en "Mi perfil" → Historial
 * de citas (ver app/perfil/page.tsx).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const recibo = await obtenerDatosRecibo(supabase, id);
  if (!recibo) return NextResponse.json({ error: "Esta cita no tiene recibo (no está completada)." }, { status: 404 });
  if (recibo.anulado) {
    return NextResponse.json({ error: "El recibo de esta cita está anulado." }, { status: 409 });
  }
  if (!recibo.clienteTelefono) {
    return NextResponse.json({ error: "Este cliente no tiene teléfono registrado." }, { status: 409 });
  }

  const nombrePila = recibo.clienteNombre.split(" ")[0] || "";
  const lineasTexto = recibo.lineas
    .map((l) => `• ${l.nombre}${l.cantidad > 1 ? ` x${l.cantidad}` : ""} — ${euros(l.precioUnitarioCentimos * l.cantidad)}`)
    .join("\n");
  const mensaje =
    `¡Hola${nombrePila ? " " + nombrePila : ""}! Aquí tienes tu recibo de Barbería Grasso — ${recibo.sedeNombre}.\n\n` +
    `📅 ${formatoFechaHora(recibo.fechaCitaISO)}\n` +
    `💈 ${recibo.profesionalNombre}\n\n` +
    `${lineasTexto}\n\n` +
    (recibo.descuentoCentimos > 0 ? `Descuento: -${euros(recibo.descuentoCentimos)}\n` : "") +
    `Total: ${euros(recibo.totalCentimos)}\n` +
    `Pago: ${etiquetaMetodoPago(recibo.metodoPago)}\n\n` +
    `¡Gracias por tu visita!`;

  try {
    await sendWhatsAppMessage(recibo.clienteTelefono, mensaje);
  } catch (err) {
    await registrarError({
      origen: "recibo_whatsapp",
      mensaje: `No se pudo enviar el recibo por WhatsApp a ${recibo.clienteNombre}.`,
      detalle: err,
    });
    return NextResponse.json(
      { error: "No se pudo enviar el WhatsApp (puede que hayan pasado más de 24h desde su último mensaje)." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

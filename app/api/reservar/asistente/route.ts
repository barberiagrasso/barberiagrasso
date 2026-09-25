import { NextRequest, NextResponse } from "next/server";
import { proponerCita } from "@/lib/asistenteReserva";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

// Buscador por texto libre del primer paso de app/reservar (ver
// lib/asistenteReserva.ts y components/reservar/AsistenteReserva.tsx).
// Sin comprobación de sesión, igual que /api/disponibilidad o
// /api/profesionales (no necesita saber quién es el cliente para
// proponer una cita), así que se frena por IP igual que /api/citas; no
// hace falta límite por teléfono porque aquí todavía no se ha pedido
// ninguno.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.mensaje || typeof body.mensaje !== "string" || !body.mensaje.trim()) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }
  if (body.mensaje.length > 500) {
    return NextResponse.json({ error: "El mensaje es demasiado largo." }, { status: 400 });
  }

  const { permitido } = await comprobarLimite(`asistente_reserva:ip:${ipDePeticion(request)}`, {
    maxIntentos: 20,
    ventanaMinutos: 15,
  });
  if (!permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  const historial = Array.isArray(body.historial)
    ? body.historial
        .filter((t: unknown): t is { remitente: string; contenido: string } => {
          const turno = t as { remitente?: unknown; contenido?: unknown };
          return (turno?.remitente === "cliente" || turno?.remitente === "ia") && typeof turno?.contenido === "string";
        })
        .slice(-8)
        .map((t: { remitente: "cliente" | "ia"; contenido: string }) => ({ remitente: t.remitente, contenido: t.contenido.slice(0, 500) }))
    : [];

  try {
    const resultado = await proponerCita(historial, body.mensaje.trim());
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("Error en el asistente de reserva", err);
    await registrarError({ origen: "asistente_reserva", mensaje: "Fallo proponiendo una cita desde el asistente", detalle: err });
    return NextResponse.json(
      { tipo: "error", mensaje: "No hemos podido procesar tu petición. Prueba a escribirlo de otra forma o resérvalo paso a paso." },
      { status: 200 }
    );
  }
}

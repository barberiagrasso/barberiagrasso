import { NextRequest, NextResponse } from "next/server";
import { crearReserva, ReservaError } from "@/lib/booking";
import { normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (
    !body?.sedeId ||
    !body?.servicioId ||
    !body?.fecha ||
    !body?.horaInicioISO ||
    !body?.cliente?.nombre ||
    !body?.cliente?.telefono
  ) {
    return NextResponse.json({ error: "Faltan datos obligatorios para reservar." }, { status: 400 });
  }

  // Frena el spam de reservas (por teléfono y por IP) sin afectar a un
  // cliente normal, que nunca hace tantas reservas seguidas.
  const telefono = normalizarTelefono(body.cliente.telefono);
  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`reserva:tel:${telefono}`, { maxIntentos: 8, ventanaMinutos: 60 }),
    comprobarLimite(`reserva:ip:${ipDePeticion(request)}`, { maxIntentos: 20, ventanaMinutos: 60 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  try {
    const { cita, profesionalNombre } = await crearReserva({
      sedeId: body.sedeId,
      servicioId: body.servicioId,
      profesionalId: body.profesionalId || null,
      fecha: body.fecha,
      horaInicioISO: body.horaInicioISO,
      cliente: body.cliente,
      aceptaComercial: Boolean(body.aceptaComercial),
      canal: "app",
      origen: "app",
      complementoIds: Array.isArray(body.complementoIds) ? body.complementoIds : [],
    });

    return NextResponse.json({ cita, profesionalNombre });
  } catch (err) {
    if (err instanceof ReservaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Error creando reserva", err);
    await registrarError({ origen: "reserva", mensaje: "Fallo creando una reserva", detalle: err });
    return NextResponse.json({ error: "No se pudo crear la reserva." }, { status: 500 });
  }
}

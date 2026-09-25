import { NextRequest, NextResponse } from "next/server";
import { crearReserva, ReservaError } from "@/lib/booking";
import { normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";

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

  // Pagar con saldo mueve dinero de verdad de la cuenta de un cliente:
  // exige sesión iniciada y, aunque el formulario ya viene relleno con
  // los datos del cliente logueado, se ignora el teléfono que llegue en
  // el cuerpo de la petición y se usa el de la sesión — así nadie puede
  // gastar el saldo de otra persona escribiendo su teléfono a mano.
  const pagarConSaldo = Boolean(body.pagarConSaldo);
  let datosCliente = body.cliente;
  if (pagarConSaldo) {
    try {
      const { cliente } = await requireClienteApi();
      datosCliente = { ...body.cliente, telefono: cliente.telefono };
    } catch (err) {
      if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
      throw err;
    }
  }

  // "app_asistente" cuando el cliente aceptó una propuesta de la
  // pantalla "¿Qué deseas?" (ver lib/asistenteReserva.ts) en vez de
  // elegirla a mano paso a paso; cualquier otro valor que llegue se
  // ignora y se trata como "app", para que nadie pueda colarse un
  // origen falso en el body.
  const origen = body.origen === "app_asistente" ? "app_asistente" : "app";

  try {
    const { cita, profesionalNombre } = await crearReserva({
      sedeId: body.sedeId,
      servicioId: body.servicioId,
      profesionalId: body.profesionalId || null,
      fecha: body.fecha,
      horaInicioISO: body.horaInicioISO,
      cliente: datosCliente,
      aceptaComercial: Boolean(body.aceptaComercial),
      canal: "app",
      origen,
      complementoIds: Array.isArray(body.complementoIds) ? body.complementoIds : [],
      pagarConSaldo,
      profesionalElegidoPorCliente: Boolean(body.profesionalElegidoPorCliente),
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

import { NextRequest, NextResponse } from "next/server";
import { crearReserva, ReservaError } from "@/lib/booking";
import { capitalizarNombre, normalizarTelefono, telefonoValido } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";
import { obtenerClienteActual, ponerCookieSesion } from "@/lib/sesionCliente";
import { createAdminClient } from "@/lib/supabase/admin";

// Máximo de citas futuras pendientes por teléfono reservando desde la web,
// para que nadie llene la agenda con un número (pedido de David, 01/11/2026).
const MAX_CITAS_FUTURAS_POR_TELEFONO = 3;

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
  const telefono = normalizarTelefono(String(body.cliente.telefono));
  if (!telefonoValido(telefono)) {
    return NextResponse.json({ error: "Revisa el teléfono: tiene que ser un móvil válido (por ejemplo 612 345 678)." }, { status: 400 });
  }
  const nombre = capitalizarNombre(String(body.cliente.nombre)).slice(0, 80);
  if (nombre.length < 2) return NextResponse.json({ error: "Escribe tu nombre." }, { status: 400 });
  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`reserva:tel:${telefono}`, { maxIntentos: 8, ventanaMinutos: 60 }),
    comprobarLimite(`reserva:ip:${ipDePeticion(request)}`, { maxIntentos: 20, ventanaMinutos: 60 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  // Canjear GrassoCoins gasta los puntos de un cliente: exige sesión
  // iniciada y, aunque el formulario ya viene relleno con los datos del
  // cliente logueado, se ignora el teléfono que llegue en el cuerpo de la
  // petición y se usa el de la sesión — así nadie puede gastar las coins
  // de otra persona escribiendo su teléfono a mano.
  // Quién es este navegador (cookie de invitado o sesión con contraseña).
  // Ojo: escribir un teléfono que ya existe NO da acceso a nada de ese
  // cliente; solo se le apunta la cita.
  const actual = await obtenerClienteActual();
  const canjearGrassoCoins = Boolean(body.canjearGrassoCoins);
  const email = typeof body.cliente.email === "string" && body.cliente.email.trim() ? body.cliente.email.trim().slice(0, 120) : null;
  let datosCliente = { nombre, telefono, email };
  if (canjearGrassoCoins) {
    if (!actual) return NextResponse.json({ error: "Para canjear GrassoCoins entra en tu perfil." }, { status: 401 });
    datosCliente = { ...datosCliente, telefono: actual.cliente.telefono };
  }

  // Tope de citas futuras pendientes por teléfono.
  {
    const admin = createAdminClient();
    const { data: existente } = await admin.from("clientes").select("id").eq("telefono", datosCliente.telefono).maybeSingle();
    if (existente) {
      const { count } = await admin
        .from("citas")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", existente.id)
        .eq("estado", "confirmada")
        .gt("inicio", new Date().toISOString());
      if ((count ?? 0) >= MAX_CITAS_FUTURAS_POR_TELEFONO) {
        return NextResponse.json(
          { error: `Ese teléfono ya tiene ${MAX_CITAS_FUTURAS_POR_TELEFONO} citas pendientes. Si necesitas otra, llámanos o escríbenos por WhatsApp.` },
          { status: 409 },
        );
      }
    }
  }

  // "app_asistente" cuando el cliente aceptó una propuesta de la
  // pantalla "¿Qué deseas?" (ver lib/asistenteReserva.ts) en vez de
  // elegirla a mano paso a paso; cualquier otro valor que llegue se
  // ignora y se trata como "app", para que nadie pueda colarse un
  // origen falso en el body.
  const origen = body.origen === "app_asistente" ? "app_asistente" : "app";

  try {
    const { cita, profesionalNombre, clienteId, esNuevo } = await crearReserva({
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
      canjearGrassoCoins,
      profesionalElegidoPorCliente: Boolean(body.profesionalElegidoPorCliente),
      notaCliente: typeof body.notaCliente === "string" ? body.notaCliente.slice(0, 500) : null,
    });

    // Cliente nuevo reservando sin sesión: se le guarda en este móvil (cookie
    // de 1 año) para reconocerle la próxima vez. Si el teléfono ya existía,
    // NO: para entrar a su perfil tendrá que verificarlo con un código.
    const guardarEnMovil = !actual && esNuevo;
    const respuesta = NextResponse.json({ cita, profesionalNombre, guardadoEnMovil: guardarEnMovil });
    if (guardarEnMovil) ponerCookieSesion(respuesta, clienteId);
    return respuesta;
  } catch (err) {
    if (err instanceof ReservaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Error creando reserva", err);
    await registrarError({ origen: "reserva", mensaje: "Fallo creando una reserva", detalle: err });
    return NextResponse.json({ error: "No se pudo crear la reserva." }, { status: 500 });
  }
}

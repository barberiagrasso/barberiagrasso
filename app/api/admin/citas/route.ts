import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearReserva, ReservaError } from "@/lib/booking";
import { cargarDatosAgenda } from "@/lib/agenda";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let admin;
  try {
    ({ admin } = await requireAdminApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const fecha = params.get("fecha"); // "YYYY-MM-DD"
  // fechaFin es opcional: permite pedir un rango de días (p.ej. la vista
  // semanal de la Agenda) en una sola llamada. Si no se manda, se comporta
  // igual que siempre: solo el día de "fecha".
  const fechaFin = params.get("fechaFin") || fecha;
  if (!sedeId || !fecha) {
    return NextResponse.json({ error: "Faltan sedeId y fecha." }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const datos = await cargarDatosAgenda(supabase, { sedeId, fecha, fechaFin: fechaFin ?? fecha, rolAdmin: admin.rol });
    return NextResponse.json(datos);
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar las citas." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (
    !body?.sedeId ||
    !body?.servicioId ||
    !body?.fecha ||
    !body?.horaInicioISO ||
    !body?.cliente?.nombre ||
    !body?.cliente?.telefono
  ) {
    return NextResponse.json({ error: "Faltan datos obligatorios." }, { status: 400 });
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
      canal: "panel",
      origen: "panel",
      complementoIds: Array.isArray(body.complementoIds) ? body.complementoIds : [],
      pagarConSaldo: Boolean(body.pagarConSaldo),
      profesionalElegidoPorCliente: Boolean(body.profesionalElegidoPorCliente),
      // Creación manual desde la Agenda arrastrando (ver MenuCreacion en
      // CalendarioDia.tsx): el barbero escribe la hora de inicio y fin a
      // mano, sin atarse a la cuadrícula de huecos de 30 minutos — ver
      // saltarValidacionSlot en lib/booking.ts.
      saltarValidacionSlot: Boolean(body.saltarValidacionSlot),
      horaFinISO: typeof body.horaFinISO === "string" ? body.horaFinISO : undefined,
    });
    return NextResponse.json({ cita, profesionalNombre });
  } catch (err) {
    if (err instanceof ReservaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Error creando reserva desde el panel", err);
    return NextResponse.json({ error: "No se pudo crear la cita." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearReserva, ReservaError } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
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
  const inicioDia = `${fecha}T00:00:00`;
  const finDia = `${fechaFin}T23:59:59`;

  const { data: citas, error } = await supabase
    .from("citas")
    .select(
      "id, inicio, fin, estado, origen, notas, cliente:clientes(id, nombre, telefono), servicio:servicios(id, nombre, duracion_minutos), profesional:profesionales(id, nombre), extras:cita_extras(servicio_id)"
    )
    .eq("sede_id", sedeId)
    .gte("inicio", inicioDia)
    .lte("inicio", finDia)
    .order("inicio");

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar las citas." }, { status: 500 });
  }

  // Profesionales de la sede y su horario del día de "fecha" — lo usa el
  // calendario de la vista de día (columnas por barbero + rango de
  // horas visible). Se calcula siempre a partir del día de "fecha" (el
  // primero del rango), así que en la vista semanal estos dos campos no
  // se usan y se pueden ignorar sin problema.
  const { data: profesionalesSede } = await supabase
    .from("profesional_sedes")
    .select("profesional_id, profesionales!inner(id, nombre, activo)")
    .eq("sede_id", sedeId)
    .eq("profesionales.activo", true);
  const profesionales = (profesionalesSede ?? [])
    .map((sp) => {
      const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
      return { id: sp.profesional_id, nombre: (prof as { nombre: string })?.nombre ?? "" };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Mediodía (no medianoche) para sacar el día de la semana: así da igual
  // en qué huso horario esté corriendo el servidor, nunca cae al otro
  // lado de la fecha.
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const { data: horarios } = await supabase
    .from("horarios")
    .select("profesional_id, hora_inicio, hora_fin, descanso_inicio, descanso_fin")
    .eq("sede_id", sedeId)
    .eq("dia_semana", diaSemana);

  // Excepciones puntuales de descanso para el día concreto de "fecha" (no
  // de todo el rango: solo la vista de día pinta el bloque de descanso,
  // y siempre muestra un único día). Solo el admin puede haberlas creado,
  // pero cualquiera que vea la agenda de ese día necesita conocerlas para
  // pintar el bloque correcto.
  const { data: descansosExcepciones } = await supabase
    .from("descansos_excepciones")
    .select("profesional_id, hora_inicio, hora_fin")
    .eq("sede_id", sedeId)
    .eq("fecha", fecha);

  return NextResponse.json({
    citas,
    profesionales,
    horarios: horarios ?? [],
    descansosExcepciones: descansosExcepciones ?? [],
  });
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

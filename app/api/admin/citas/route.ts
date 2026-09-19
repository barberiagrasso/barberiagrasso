import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearReserva, ReservaError } from "@/lib/booking";
import { puedeVerTelefonos } from "@/lib/telefono";
import { resolverCandidatosConDestinosPuntuales } from "@/lib/availability";

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
  const inicioDia = `${fecha}T00:00:00`;
  const finDia = `${fechaFin}T23:59:59`;

  const { data: citas, error } = await supabase
    .from("citas")
    .select(
      "id, inicio, fin, estado, origen, notas, profesional_elegido_por_cliente, cliente:clientes(id, nombre, telefono), servicio:servicios(id, nombre, duracion_minutos, color), profesional:profesionales(id, nombre), extras:cita_extras(servicio_id)"
    )
    .eq("sede_id", sedeId)
    .gte("inicio", inicioDia)
    .lte("inicio", finDia)
    .order("inicio");

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar las citas." }, { status: 500 });
  }

  // Un barbero puede ver la Agenda, pero nunca el teléfono de un cliente
  // — solo un administrador (ver lib/telefono.ts). Se enmascara aquí, no
  // solo en la pantalla, para que no quede expuesto ni mirando la
  // respuesta de la petición.
  const citasParaElRol = puedeVerTelefonos(admin.rol)
    ? citas
    : (citas ?? []).map((c) => ({
        ...c,
        cliente: c.cliente ? { ...c.cliente, telefono: null } : null,
      }));

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
  const profesionalesPermanentes = (profesionalesSede ?? []).map((sp) => {
    const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
    return { id: sp.profesional_id as string, nombre: (prof as { nombre: string })?.nombre ?? "" };
  });

  // Destinos puntuales de "fecha" (el primer día del rango — ver más
  // arriba): alguien puede estar hoy aquí sin ser de esta sede de forma
  // habitual (p.ej. Juan en Los Molinos un día suelto que Diego le haya
  // asignado), o al revés, redirigido fuera de su sede habitual ese día
  // concreto. Dos consultas simples en vez de un .or() con ids a mano.
  const idsPermanentes = profesionalesPermanentes.map((p) => p.id);
  const consultasDestinos = [
    supabase
      .from("destinos_puntuales")
      .select("profesional_id, sede_id, fecha, hora_inicio, hora_fin, profesionales!inner(nombre)")
      .eq("sede_id", sedeId)
      .eq("fecha", fecha),
  ];
  if (idsPermanentes.length > 0) {
    consultasDestinos.push(
      supabase
        .from("destinos_puntuales")
        .select("profesional_id, sede_id, fecha, hora_inicio, hora_fin, profesionales!inner(nombre)")
        .eq("fecha", fecha)
        .in("profesional_id", idsPermanentes)
    );
  }
  const resultadosDestinos = await Promise.all(consultasDestinos);
  const destinosPorProfesional = new Map<
    string,
    { profesional_id: string; nombre: string; sede_id: string; fecha: string; hora_inicio: string; hora_fin: string }
  >();
  for (const { data } of resultadosDestinos) {
    for (const fila of data ?? []) {
      const prof = Array.isArray(fila.profesionales) ? fila.profesionales[0] : fila.profesionales;
      destinosPorProfesional.set(fila.profesional_id, {
        profesional_id: fila.profesional_id,
        nombre: (prof as { nombre: string } | null)?.nombre ?? "",
        sede_id: fila.sede_id,
        fecha: fila.fecha,
        hora_inicio: fila.hora_inicio,
        hora_fin: fila.hora_fin,
      });
    }
  }
  const destinosDelDia = [...destinosPorProfesional.values()];

  const { candidatos: profesionalesConDestinos, horariosExtra } = resolverCandidatosConDestinosPuntuales({
    candidatosPermanentes: profesionalesPermanentes,
    destinosDelDia,
    sedeId,
    // Este listado no está restringido a un servicio concreto (es la
    // vista de día completa de la Agenda), así que nadie queda excluido
    // por "no hacer tal servicio": basta con que tenga un destino
    // puntual a esta sede hoy.
    idsQueHacenServicio: new Set(destinosDelDia.map((d) => d.profesional_id)),
  });
  const profesionales = profesionalesConDestinos.sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Mediodía (no medianoche) para sacar el día de la semana: así da igual
  // en qué huso horario esté corriendo el servidor, nunca cae al otro
  // lado de la fecha.
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const { data: horariosSede } = await supabase
    .from("horarios")
    .select("profesional_id, hora_inicio, hora_fin, descanso_inicio, descanso_fin")
    .eq("sede_id", sedeId)
    .eq("dia_semana", diaSemana);
  // Quita el turno habitual de quien hoy está redirigido a otra sede, y
  // añade el turno sintético de quien ha llegado puntualmente a esta.
  const idsRedirigidosFuera = new Set(destinosDelDia.filter((d) => d.sede_id !== sedeId).map((d) => d.profesional_id));
  const horarios = [...(horariosSede ?? []).filter((h) => !idsRedirigidosFuera.has(h.profesional_id)), ...horariosExtra];

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
    citas: citasParaElRol,
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

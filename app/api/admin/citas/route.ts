import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearReserva, ReservaError } from "@/lib/booking";
import { cargarDatosAgenda } from "@/lib/agenda";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";
import { registrarError } from "@/lib/errorLog";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";

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
    const { cita, profesionalNombre, esNuevo } = await crearReserva({
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
      canjearGrassoCoins: Boolean(body.canjearGrassoCoins),
      profesionalElegidoPorCliente: Boolean(body.profesionalElegidoPorCliente),
      // Creación manual desde la Agenda arrastrando (ver MenuCreacion en
      // CalendarioDia.tsx): el barbero escribe la hora de inicio y fin a
      // mano, sin atarse a la cuadrícula de huecos de 30 minutos — ver
      // saltarValidacionSlot en lib/booking.ts.
      saltarValidacionSlot: Boolean(body.saltarValidacionSlot),
      horaFinISO: typeof body.horaFinISO === "string" ? body.horaFinISO : undefined,
    });

    // Cliente que nunca había reservado con nosotros y la cita se la ha
    // hecho la barbería (nunca ha escrito él mismo por WhatsApp ni por la
    // app) — pedido de Diego (03/10/2026): como hacía Booksy, se le avisa
    // por WhatsApp de la cita y de que se descargue la app. Nunca bloquea
    // la creación de la cita, que ya está hecha.
    if (esNuevo) {
      const admin = createAdminClient();
      const { data: servicio } = await admin.from("servicios").select("nombre").eq("id", body.servicioId).maybeSingle();
      await avisarCitaNuevaCliente({
        nombre: body.cliente.nombre,
        telefono: body.cliente.telefono,
        servicioNombre: servicio?.nombre,
        inicioISO: cita.inicio,
      });
    }

    return NextResponse.json({ cita, profesionalNombre });
  } catch (err) {
    if (err instanceof ReservaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Error creando reserva desde el panel", err);
    return NextResponse.json({ error: "No se pudo crear la cita." }, { status: 500 });
  }
}

async function avisarCitaNuevaCliente({
  nombre,
  telefono,
  servicioNombre,
  inicioISO,
}: {
  nombre: string;
  telefono: string;
  servicioNombre?: string;
  inicioISO: string;
}) {
  try {
    const admin = createAdminClient();
    const { data: plantilla } = await admin
      .from("plantillas_whatsapp")
      .select("*")
      .eq("tipo", "cita_nueva_cliente")
      .eq("activa", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (!plantilla) {
      // No es un error de verdad: simplemente Diego no ha registrado
      // todavía esta plantilla en /admin/plantillas.
      return;
    }

    const hora = new Date(inicioISO).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    const fecha = new Date(inicioISO).toLocaleDateString("es-ES", { timeZone: TZ, day: "2-digit", month: "2-digit" });
    const variables = resolverVariablesPlantilla(plantilla.variables ?? [], {
      nombre,
      servicio: servicioNombre ?? "",
      hora,
      fecha,
    });
    await sendWhatsAppTemplate(telefono, plantilla.nombre_meta, plantilla.idioma, variables);
  } catch (err) {
    await registrarError({
      origen: "aviso_alta",
      mensaje: `No se pudo avisar por WhatsApp a ${nombre} de su primera cita (creada desde el panel).`,
      detalle: err,
    });
  }
}

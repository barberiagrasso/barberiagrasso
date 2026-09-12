import { NextRequest, NextResponse } from "next/server";
import { parse, startOfDay, endOfDay, addDays, differenceInCalendarDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";
const MAX_DIAS_OCUPACION = 92; // ~3 meses, para no disparar el cálculo de huecos en rangos enormes

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi();
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const sedeId = params.get("sedeId");
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");
  if (!sedeId || !desdeStr || !hastaStr) {
    return NextResponse.json({ error: "Faltan sedeId, desde y hasta." }, { status: 400 });
  }

  const inicioLocal = startOfDay(parse(desdeStr, "yyyy-MM-dd", new Date()));
  const finLocal = endOfDay(parse(hastaStr, "yyyy-MM-dd", new Date()));
  const desdeUTC = fromZonedTime(inicioLocal, TZ);
  const hastaUTC = fromZonedTime(finLocal, TZ);

  const supabase = createAdminClient();

  // --- Citas completadas del rango, con su servicio y su precio ---
  const { data: citas } = await supabase
    .from("citas")
    .select("id, profesional_id, servicio_id, estado, inicio, profesional:profesionales(nombre), servicio:servicios(nombre, precio_centimos)")
    .eq("sede_id", sedeId)
    .gte("inicio", desdeUTC.toISOString())
    .lte("inicio", hastaUTC.toISOString());

  const citasCompletadas = (citas ?? []).filter((c) => c.estado === "completada");
  const idsCitasCompletadas = citasCompletadas.map((c) => c.id);

  const { data: extras } = await supabase
    .from("cita_extras")
    .select("cita_id, precio_centimos, servicio:servicios(nombre)")
    .in("cita_id", idsCitasCompletadas.length ? idsCitasCompletadas : ["00000000-0000-0000-0000-000000000000"]);

  // --- Ingresos por barbero ---
  const ingresosPorBarberoMap = new Map<string, { nombre: string; ingresosCentimos: number }>();
  for (const c of citasCompletadas) {
    const profesional = Array.isArray(c.profesional) ? c.profesional[0] : c.profesional;
    const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
    const clave = c.profesional_id ?? "sin-asignar";
    const actual = ingresosPorBarberoMap.get(clave) ?? { nombre: profesional?.nombre ?? "Sin asignar", ingresosCentimos: 0 };
    actual.ingresosCentimos += servicio?.precio_centimos ?? 0;
    ingresosPorBarberoMap.set(clave, actual);
  }
  const extrasPorCita = new Map<string, number>();
  for (const e of extras ?? []) {
    extrasPorCita.set(e.cita_id, (extrasPorCita.get(e.cita_id) ?? 0) + e.precio_centimos);
  }
  for (const c of citasCompletadas) {
    const extra = extrasPorCita.get(c.id);
    if (!extra) continue;
    const clave = c.profesional_id ?? "sin-asignar";
    const actual = ingresosPorBarberoMap.get(clave);
    if (actual) actual.ingresosCentimos += extra;
  }

  const ingresosPorBarbero = Array.from(ingresosPorBarberoMap.values()).sort((a, b) => b.ingresosCentimos - a.ingresosCentimos);
  const ingresosTotalCentimos = ingresosPorBarbero.reduce((acc, b) => acc + b.ingresosCentimos, 0);

  // --- Servicios y complementos más pedidos (por nº de veces) ---
  const conteoServicios = new Map<string, { nombre: string; cantidad: number; ingresosCentimos: number }>();
  for (const c of citasCompletadas) {
    const servicio = Array.isArray(c.servicio) ? c.servicio[0] : c.servicio;
    const nombre = servicio?.nombre ?? "Servicio";
    const actual = conteoServicios.get(nombre) ?? { nombre, cantidad: 0, ingresosCentimos: 0 };
    actual.cantidad += 1;
    actual.ingresosCentimos += servicio?.precio_centimos ?? 0;
    conteoServicios.set(nombre, actual);
  }
  for (const e of extras ?? []) {
    const servicio = Array.isArray(e.servicio) ? e.servicio[0] : e.servicio;
    const nombre = servicio?.nombre ?? "Complemento";
    const actual = conteoServicios.get(nombre) ?? { nombre, cantidad: 0, ingresosCentimos: 0 };
    actual.cantidad += 1;
    actual.ingresosCentimos += e.precio_centimos;
    conteoServicios.set(nombre, actual);
  }
  const serviciosMasPedidos = Array.from(conteoServicios.values()).sort((a, b) => b.cantidad - a.cantidad);

  // --- Ocupación aproximada por franja horaria (todas las citas activas, no solo completadas) ---
  const totalDias = differenceInCalendarDays(finLocal, inicioLocal) + 1;
  let ocupacionPorHora: { hora: number; ocupadas: number; capacidad: number }[] = [];
  let ocupacionLimitada = false;

  if (totalDias > MAX_DIAS_OCUPACION) {
    ocupacionLimitada = true;
  } else {
    const { data: horarios } = await supabase.from("horarios").select("profesional_id, dia_semana, hora_inicio, hora_fin").eq("sede_id", sedeId);
    const { data: bloqueos } = await supabase
      .from("bloqueos")
      .select("profesional_id, fecha_inicio, fecha_fin")
      .eq("sede_id", sedeId)
      .lt("fecha_inicio", hastaUTC.toISOString())
      .gt("fecha_fin", desdeUTC.toISOString());

    const capacidadPorHora = new Map<number, number>();
    for (let i = 0; i < totalDias; i++) {
      const dia = addDays(inicioLocal, i);
      const diaSemana = toZonedTime(dia, TZ).getDay();
      const inicioDiaUTC = fromZonedTime(startOfDay(dia), TZ);
      const finDiaUTC = fromZonedTime(endOfDay(dia), TZ);
      const horariosDelDia = (horarios ?? []).filter((h) => h.dia_semana === diaSemana);
      for (const h of horariosDelDia) {
        const bloqueado = (bloqueos ?? []).some(
          (b) =>
            (b.profesional_id === h.profesional_id || b.profesional_id === null) &&
            new Date(b.fecha_inicio) < finDiaUTC &&
            new Date(b.fecha_fin) > inicioDiaUTC
        );
        if (bloqueado) continue;
        const horaInicio = parseInt(h.hora_inicio.slice(0, 2), 10);
        const horaFinNum = parseInt(h.hora_fin.slice(0, 2), 10);
        for (let hora = horaInicio; hora < horaFinNum; hora++) {
          capacidadPorHora.set(hora, (capacidadPorHora.get(hora) ?? 0) + 1);
        }
      }
    }

    const ocupadasPorHora = new Map<number, number>();
    for (const c of citas ?? []) {
      if (c.estado === "cancelada") continue;
      const horaLocal = toZonedTime(new Date(c.inicio), TZ).getHours();
      ocupadasPorHora.set(horaLocal, (ocupadasPorHora.get(horaLocal) ?? 0) + 1);
    }

    const horas = new Set([...capacidadPorHora.keys(), ...ocupadasPorHora.keys()]);
    ocupacionPorHora = Array.from(horas)
      .sort((a, b) => a - b)
      .map((hora) => ({ hora, ocupadas: ocupadasPorHora.get(hora) ?? 0, capacidad: capacidadPorHora.get(hora) ?? 0 }));
  }

  return NextResponse.json({
    ingresosPorBarbero,
    ingresosTotalCentimos,
    serviciosMasPedidos,
    ocupacionPorHora,
    ocupacionLimitada,
    citasCompletadasCount: citasCompletadas.length,
  });
}

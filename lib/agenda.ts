import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCandidatosConDestinosPuntuales } from "@/lib/availability";
import { puedeVerTelefonos } from "@/lib/telefono";

// =====================================================================
// Todo lo que necesita pintar la Agenda (citas, profesionales del día,
// sus horarios y los descansos puntuales) para una sede y un rango de
// fechas. Antes vivía solo dentro del GET de /api/admin/citas; se ha
// sacado aquí para que la propia página del panel (app/admin/.../
// dashboard/page.tsx) pueda pedir el primer día YA en el servidor, sin
// esperar a que el navegador cargue el JS y lance el fetch — así la
// Agenda no aparece vacía ("Cargando…") mientras hidrata.
//
// Las consultas que no dependen unas de otras van en paralelo (antes
// iban todas en fila, una detrás de otra: con Supabase en otra región
// que el servidor, cada ida y vuelta de red se nota, y sumaban 5-6
// seguidas solo para abrir la Agenda). Solo los destinos_puntuales
// tienen que esperar, porque necesitan saber quién es candidato
// permanente de la sede antes de poder pedirlos.
// =====================================================================

// "citas" se deja sin tipar fuerte a propósito: es el resultado tal
// cual de un .select() con relaciones anidadas (cliente/servicio/
// profesional/extras), igual de suelto que en el resto de rutas de este
// proyecto — quien lo consume (la API o la propia página) ya sabe la
// forma real por el select de arriba.
export interface DatosAgenda {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  citas: any[];
  profesionales: { id: string; nombre: string }[];
  horarios: { profesional_id: string; hora_inicio: string; hora_fin: string; descanso_inicio?: string | null; descanso_fin?: string | null }[];
  descansosExcepciones: { profesional_id: string; hora_inicio: string; hora_fin: string }[];
}

export async function cargarDatosAgenda(
  supabase: SupabaseClient,
  params: { sedeId: string; fecha: string; fechaFin: string; rolAdmin: string }
): Promise<DatosAgenda> {
  const { sedeId, fecha, fechaFin, rolAdmin } = params;
  const inicioDia = `${fecha}T00:00:00`;
  const finDia = `${fechaFin}T23:59:59`;
  // Mediodía (no medianoche) para sacar el día de la semana: así da igual
  // en qué huso horario esté corriendo el servidor, nunca cae al otro
  // lado de la fecha.
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();

  // Primera tanda: ninguna de estas cuatro consultas depende del
  // resultado de otra, así que salen todas a la vez.
  const [{ data: citas, error }, { data: profesionalesSede }, { data: horariosSede }, { data: descansosExcepciones }] =
    await Promise.all([
      supabase
        .from("citas")
        .select(
          "id, inicio, fin, estado, origen, notas, profesional_elegido_por_cliente, metodo_pago, cliente:clientes(id, nombre, telefono), servicio:servicios(id, nombre, duracion_minutos, color), profesional:profesionales(id, nombre), extras:cita_extras(servicio_id)"
        )
        .eq("sede_id", sedeId)
        .gte("inicio", inicioDia)
        .lte("inicio", finDia)
        .order("inicio"),
      supabase
        .from("profesional_sedes")
        .select("profesional_id, profesionales!inner(id, nombre, activo)")
        .eq("sede_id", sedeId)
        .eq("profesionales.activo", true),
      supabase
        .from("horarios")
        .select("profesional_id, hora_inicio, hora_fin, descanso_inicio, descanso_fin")
        .eq("sede_id", sedeId)
        .eq("dia_semana", diaSemana),
      supabase.from("descansos_excepciones").select("profesional_id, hora_inicio, hora_fin").eq("sede_id", sedeId).eq("fecha", fecha),
    ]);

  if (error) throw new Error("No se pudieron cargar las citas.");

  // Un barbero puede ver la Agenda, pero nunca el teléfono de un cliente
  // — solo un administrador (ver lib/telefono.ts). Se enmascara aquí, no
  // solo en la pantalla, para que no quede expuesto ni mirando la
  // respuesta de la petición.
  const citasParaElRol = puedeVerTelefonos(rolAdmin)
    ? (citas ?? [])
    : (citas ?? []).map((c) => ({
        ...c,
        cliente: c.cliente ? { ...c.cliente, telefono: null } : null,
      }));

  const profesionalesPermanentes = (profesionalesSede ?? []).map((sp) => {
    const prof = Array.isArray(sp.profesionales) ? sp.profesionales[0] : sp.profesionales;
    return { id: sp.profesional_id as string, nombre: (prof as { nombre: string })?.nombre ?? "" };
  });

  // Segunda tanda: los destinos puntuales de "fecha" — alguien puede
  // estar hoy aquí sin ser de esta sede de forma habitual (p.ej. Juan en
  // Los Molinos un día suelto), o al revés, redirigido fuera de su sede
  // habitual ese día concreto. Dos consultas simples en vez de un .or()
  // con ids a mano; solo pueden salir después de saber quién es
  // permanente de esta sede (idsPermanentes, de la tanda anterior).
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

  // Quita el turno habitual de quien hoy está redirigido a otra sede, y
  // añade el turno sintético de quien ha llegado puntualmente a esta.
  const idsRedirigidosFuera = new Set(destinosDelDia.filter((d) => d.sede_id !== sedeId).map((d) => d.profesional_id));
  const horarios = [...(horariosSede ?? []).filter((h) => !idsRedirigidosFuera.has(h.profesional_id)), ...horariosExtra];

  return {
    citas: citasParaElRol,
    profesionales,
    horarios,
    descansosExcepciones: descansosExcepciones ?? [],
  };
}

import "server-only";
import { addMinutes } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvailableSlots, comprobarHuecoLibre } from "@/lib/availability";
import { buscarOCrearCliente, normalizarTelefono } from "@/lib/clientes";
import { sincronizarClienteHubSpot, sincronizarCitaHubSpot } from "@/lib/hubspot";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { canjearSaldoEnCita, reembolsarSaldoDeCita, saldoDelCliente, SaldoInsuficienteError } from "@/lib/fidelizacion";
import { fechaDentroDeFlexibilidad, sumarDias } from "@/lib/listaEspera";
import type { CanalConsentimiento } from "@/lib/types";

// Fecha "YYYY-MM-DD" de un instante ISO en la zona horaria del negocio
// (Europe/Madrid) — la misma noción de "día" que usa lib/availability.ts
// y que el cliente elige en el flujo de reserva. Necesaria porque
// citas.inicio se guarda en UTC y puede caer en otro día de calendario
// cerca de medianoche.
function fechaMadrid(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

// Re-exportado por compatibilidad: varios módulos (webhook de WhatsApp,
// aiAssistant) siguen importando normalizarTelefono desde aquí. La
// implementación real vive en lib/clientes.ts junto al resto de lógica
// de "quién es este cliente".
export { normalizarTelefono };

export const TEXTO_CONSENTIMIENTO_OPERATIVO =
  "Acepto que Barbería Grasso trate mis datos (nombre y teléfono) para gestionar esta cita.";
export const TEXTO_CONSENTIMIENTO_COMERCIAL =
  "Acepto recibir ofertas y comunicaciones comerciales de Barbería Grasso por WhatsApp, email o notificaciones. Puedo darme de baja cuando quiera.";

interface DatosCliente {
  nombre: string;
  telefono: string;
  email?: string | null;
}

interface CrearReservaParams {
  sedeId: string;
  servicioId: string;
  profesionalId?: string | null;
  fecha: string; // "YYYY-MM-DD"
  horaInicioISO: string; // ISO UTC, debe coincidir con un slot disponible
  cliente: DatosCliente;
  aceptaComercial: boolean;
  canal: CanalConsentimiento;
  // "lista_espera": la crea sola el sistema al liberarse un hueco que le
  // encajaba a alguien apuntado (ver asignarListaEsperaPorHueco), no el
  // propio cliente en el momento. "app_asistente": el cliente aceptó una
  // propuesta de la pantalla "¿Qué deseas?" (ver lib/asistenteReserva.ts)
  // en vez de elegirla a mano paso a paso — se distingue de "app" para
  // que los informes por canal (SeccionIngresos/SeccionNoShows) puedan
  // mostrar cuánto se reserva a través del asistente de IA.
  origen: "app" | "app_asistente" | "panel" | "whatsapp" | "lista_espera";
  // Complementos añadidos al servicio principal en el paso extra de la
  // reserva (p. ej. cejas, lavado). Amplían el hueco bloqueado en la
  // agenda y quedan anotados en la cita para que el barbero cobre bien.
  complementoIds?: string[];
  // Si es true, el cliente paga el total de la cita con su saldo de
  // fidelización en vez de en efectivo/tarjeta. Solo se admite si el
  // saldo cubre el total exacto (ver lib/fidelizacion.ts) — no hay canje
  // parcial.
  pagarConSaldo?: boolean;
  // true si quien reserva pidió expresamente este profesional (no
  // "Cualquiera") — para el icono de corazón de la Agenda. No se puede
  // deducir de profesionalId/slotElegido porque esos ya traen el barbero
  // asignado en los dos casos.
  profesionalElegidoPorCliente?: boolean;
  // Creación manual desde la Agenda arrastrando (ver MenuCreacion en
  // CalendarioDia.tsx, pedido de Diego 25/09/2026): el barbero escribe la
  // hora de inicio y fin a mano, como en Booksy, sin atarse a la
  // cuadrícula de huecos de 30 minutos que sí rige para el cliente
  // reservando por la web/WhatsApp. Requiere profesionalId (no vale
  // "cualquiera") y se valida con comprobarHuecoLibre en vez de con
  // getAvailableSlots.
  saltarValidacionSlot?: boolean;
  // Fin exacto de la cita cuando saltarValidacionSlot es true. Si no se
  // manda, se calcula sumando la duración del servicio (+ complementos) a
  // horaInicioISO, igual que en el resto de la app.
  horaFinISO?: string;
}

export class ReservaError extends Error {}

interface ApuntarseListaEsperaParams {
  sedeId: string;
  servicioId: string;
  // null/omitido = le vale cualquier profesional de la sede.
  profesionalId?: string | null;
  fecha: string; // "YYYY-MM-DD", el mismo día que el cliente veía sin huecos
  // 0 = solo ese día exacto, 1 = ±1 día, 2 = ±2 días — lo que responda a
  // "¿qué fecha te interesa?" en el paso de fecha de app/reservar.
  flexibilidadDias: number;
  cliente: DatosCliente;
  aceptaComercial: boolean;
  canal: CanalConsentimiento;
}

/**
 * Apunta a un cliente a la lista de espera de un día sin huecos. Se usa
 * desde el paso de fecha de app/reservar cuando la búsqueda de huecos
 * viene vacía. Si el mismo cliente ya estaba apuntado a lo mismo (mismo
 * barbero pedido, o "cualquiera"), no duplica la fila: actualiza el
 * margen de flexibilidad por si ha cambiado de idea y devuelve esa
 * misma entrada.
 */
export async function apuntarseListaEspera(params: ApuntarseListaEsperaParams) {
  const supabase = createAdminClient();

  const { clienteId, esNuevo } = await buscarOCrearCliente(supabase, {
    nombre: params.cliente.nombre,
    telefono: params.cliente.telefono,
    email: params.cliente.email,
    sedeId: params.sedeId,
  });

  if (esNuevo) {
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "operativo",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_OPERATIVO,
    });
  }
  if (params.aceptaComercial) {
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "comercial",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_COMERCIAL,
    });
  }

  let consultaExistente = supabase
    .from("lista_espera")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("sede_id", params.sedeId)
    .eq("servicio_id", params.servicioId)
    .eq("fecha", params.fecha)
    .eq("estado", "pendiente");
  consultaExistente = params.profesionalId
    ? consultaExistente.eq("profesional_id", params.profesionalId)
    : consultaExistente.is("profesional_id", null);
  const { data: existente } = await consultaExistente.maybeSingle();

  if (existente) {
    if (existente.flexibilidad_dias === params.flexibilidadDias) return { entrada: existente };
    const { data: actualizada } = await supabase
      .from("lista_espera")
      .update({ flexibilidad_dias: params.flexibilidadDias })
      .eq("id", existente.id)
      .select("*")
      .single();
    return { entrada: actualizada ?? existente };
  }

  const { data: entrada, error } = await supabase
    .from("lista_espera")
    .insert({
      cliente_id: clienteId,
      sede_id: params.sedeId,
      servicio_id: params.servicioId,
      profesional_id: params.profesionalId || null,
      fecha: params.fecha,
      flexibilidad_dias: params.flexibilidadDias,
    })
    .select("*")
    .single();

  if (error || !entrada) throw new ReservaError("No se pudo apuntar a la lista de espera.");
  return { entrada };
}

// Cuántos candidatos de la lista de espera se prueban, como mucho, por
// cada cancelación. Solo se le acaba asignando el hueco a UNO (el
// primero al que de verdad le encaje en el momento de comprobarlo), pero
// si a los primeros no les cabe el servicio que pidieron en el hueco que
// ha quedado, se sigue probando con los siguientes en vez de rendirse.
const MAX_CANDIDATOS_LISTA_ESPERA_POR_HUECO = 8;

/**
 * Al cancelarse una cita, comprueba si alguien de la lista de espera de
 * esa sede puede ocupar ahora un hueco real ese mismo día — decisión de
 * Diego (18/09/2026): la lista de espera ya no solo avisa, reserva sola
 * y avisa por WhatsApp de la cita ya hecha. Se prueba en orden de
 * llegada (quien se apuntó antes tiene preferencia); de cada candidato
 * se comprueba que el día liberado caiga dentro de su margen de
 * flexibilidad (día exacto, ±1 o ±2) y que, con el profesional que pidió
 * (o cualquiera), quede de verdad un hueco que le encaje en duración —
 * volviendo a calcular la disponibilidad real de ese día en vez de fiarse
 * de la cita que se acaba de cancelar, porque puede que ese hueco
 * concreto no le sirva (otro servicio, otra duración) pero SÍ le sirva
 * otro hueco distinto que ya hubiera libre ese día. En cuanto uno se
 * lleva un hueco, dejará de aparecer disponible para el siguiente
 * candidato (se vuelve a comprobar la disponibilidad real en cada
 * intento). Nunca lanza: un fallo aquí no debe impedir que la
 * cancelación en sí se complete.
 */
async function asignarListaEsperaPorHueco(citaCancelada: { sede_id: string; inicio: string }) {
  try {
    const supabase = createAdminClient();
    const fechaLiberada = fechaMadrid(citaCancelada.inicio);

    const { data: candidatos } = await supabase
      .from("lista_espera")
      .select("id, servicio_id, profesional_id, fecha, flexibilidad_dias, cliente:clientes(nombre, telefono, email)")
      .eq("sede_id", citaCancelada.sede_id)
      .eq("estado", "pendiente")
      // Rango amplio (máxima flexibilidad posible, ±2 días) para no
      // dejar fuera a nadie que pudiera encajar; el filtro exacto por su
      // propio margen se hace abajo, candidato a candidato.
      .gte("fecha", sumarDias(fechaLiberada, -2))
      .lte("fecha", sumarDias(fechaLiberada, 2))
      .order("created_at", { ascending: true })
      .limit(MAX_CANDIDATOS_LISTA_ESPERA_POR_HUECO);

    if (!candidatos || candidatos.length === 0) return;

    for (const candidato of candidatos) {
      if (!fechaDentroDeFlexibilidad(candidato.fecha, fechaLiberada, candidato.flexibilidad_dias)) continue;

      const cliente = Array.isArray(candidato.cliente) ? candidato.cliente[0] : candidato.cliente;
      if (!cliente?.telefono) continue;

      const slots = await getAvailableSlots({
        sedeId: citaCancelada.sede_id,
        servicioId: candidato.servicio_id,
        fecha: fechaLiberada,
        profesionalId: candidato.profesional_id,
      });
      if (slots.length === 0) continue; // este día en concreto no le encaja de verdad; se sigue probando con el siguiente

      let cita;
      let profesionalNombre: string;
      try {
        const resultado = await crearReserva({
          sedeId: citaCancelada.sede_id,
          servicioId: candidato.servicio_id,
          profesionalId: slots[0].profesional_id,
          fecha: fechaLiberada,
          horaInicioISO: slots[0].hora_inicio,
          cliente: { nombre: cliente.nombre, telefono: cliente.telefono, email: cliente.email },
          aceptaComercial: false,
          canal: "app",
          origen: "lista_espera",
          // Si al apuntarse pidió un profesional concreto (no
          // "Cualquiera"), sigue siendo su elección aunque la reserva la
          // haga el sistema en su nombre al liberarse el hueco.
          profesionalElegidoPorCliente: candidato.profesional_id !== null,
        });
        cita = resultado.cita;
        profesionalNombre = resultado.profesionalNombre;
      } catch (err) {
        // Alguien se lo ha llevado justo a la vez (carrera improbable) u
        // otro fallo puntual: se sigue probando con el siguiente en vez
        // de dejar el hueco sin asignar a nadie.
        console.error("No se pudo asignar automáticamente un hueco de la lista de espera a un candidato", err);
        continue;
      }

      // La entrada de este candidato puede tener una fecha distinta a la
      // liberada (pidió flexibilidad), así que se marca por su propio id
      // en vez del filtro por fecha exacta que ya hace crearReserva.
      await supabase.from("lista_espera").update({ estado: "reservado" }).eq("id", candidato.id);

      const nombrePila = cliente.nombre?.split(" ")[0] || "";
      const horaTexto = new Date(cita.inicio).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
      const fechaTexto = new Date(`${fechaLiberada}T12:00:00`).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Madrid",
      });
      try {
        await sendWhatsAppMessage(
          cliente.telefono,
          `¡Hola${nombrePila ? " " + nombrePila : ""}! Se ha liberado un hueco y te hemos reservado ya tu cita en Barbería Grasso el ${fechaTexto} a las ${horaTexto} con ${profesionalNombre}. Si no puedes venir, cancélala desde la app o escríbenos.`
        );
      } catch (err) {
        console.error("No se pudo avisar por WhatsApp de la cita asignada automáticamente por la lista de espera", err);
      }
    }
  } catch (err) {
    console.error("Error asignando la lista de espera", err);
  }
}

/**
 * Punto único para crear una cita, usado tanto por la reserva desde la
 * app/web como por el futuro asistente de WhatsApp. Vuelve a comprobar
 * disponibilidad justo antes de insertar para evitar dobles reservas si
 * dos personas piden el mismo hueco casi a la vez.
 */
export async function crearReserva(params: CrearReservaParams) {
  const supabase = createAdminClient();

  // Complementos añadidos en el paso extra (opcional): amplían la
  // duración del hueco. Se guardan como filas propias en cita_extras
  // (para que los informes de facturación y servicios más pedidos los
  // cuenten con precisión) y también como texto en "notas" para que se
  // lean de un vistazo en la agenda.
  const complementoIds = (params.complementoIds ?? []).filter(Boolean);
  let duracionExtraMinutos = 0;
  let notaComplementos: string | null = null;
  let complementosParaGuardar: { servicio_id: string; precio_centimos: number; duracion_minutos: number }[] = [];
  if (complementoIds.length > 0) {
    const { data: complementos } = await supabase
      .from("servicios")
      .select("id, nombre, duracion_minutos, precio_centimos")
      .in("id", complementoIds);
    if (complementos && complementos.length > 0) {
      duracionExtraMinutos = complementos.reduce((acc, c) => acc + c.duracion_minutos, 0);
      notaComplementos = "Complementos: " + complementos.map((c) => `${c.nombre} (${(c.precio_centimos / 100).toFixed(2)}€)`).join(", ");
      complementosParaGuardar = complementos.map((c) => ({
        servicio_id: c.id,
        precio_centimos: c.precio_centimos,
        duracion_minutos: c.duracion_minutos,
      }));
    }
  }

  // La disponibilidad se calcula distinto según el origen de la reserva:
  // - Normal (cliente por web/WhatsApp, cita rápida del barbero): tiene
  //   que coincidir con un hueco real de la cuadrícula de 30 minutos
  //   (getAvailableSlots) — sin cambios.
  // - saltarValidacionSlot (creación manual arrastrando en la Agenda,
  //   pedido de Diego 25/09/2026): el barbero escribe la hora a mano, como
  //   en Booksy; se comprueba con comprobarHuecoLibre en su lugar (mismo
  //   criterio de fondo — turno, descanso, bloqueos/vacaciones y otras
  //   citas — pero sin exigir que caiga justo en un múltiplo de 30 min).
  // Las otras dos consultas (servicio/sede) no dependen de ninguna de las
  // dos, así que van siempre en el mismo Promise.all.
  const [{ data: servicio }, { data: override }] = await Promise.all([
    supabase.from("servicios").select("duracion_minutos, precio_centimos").eq("id", params.servicioId).single(),
    supabase
      .from("sede_servicios")
      .select("duracion_minutos")
      .eq("sede_id", params.sedeId)
      .eq("servicio_id", params.servicioId)
      .maybeSingle(),
  ]);
  const duracionMinutos = (override?.duracion_minutos ?? servicio?.duracion_minutos ?? 30) + duracionExtraMinutos;

  let profesionalIdElegido: string;
  let profesionalNombreElegido: string;
  let inicio: Date;
  let fin: Date;

  if (params.saltarValidacionSlot) {
    if (!params.profesionalId) {
      throw new ReservaError("Falta indicar el profesional para crear la cita.");
    }
    inicio = new Date(params.horaInicioISO);
    fin = params.horaFinISO ? new Date(params.horaFinISO) : addMinutes(inicio, duracionMinutos);
    if (!(fin > inicio)) {
      throw new ReservaError("La hora de fin debe ser posterior a la de inicio.");
    }
    const libre = await comprobarHuecoLibre({
      sedeId: params.sedeId,
      profesionalId: params.profesionalId,
      fecha: params.fecha,
      inicioISO: inicio.toISOString(),
      finISO: fin.toISOString(),
    });
    if (!libre) {
      throw new ReservaError("Ese profesional no tiene hueco libre a esa hora.");
    }
    profesionalIdElegido = params.profesionalId;
    const { data: profesional } = await supabase
      .from("profesionales")
      .select("nombre")
      .eq("id", params.profesionalId)
      .single();
    profesionalNombreElegido = profesional?.nombre ?? "";
  } else {
    const slots = await getAvailableSlots({
      sedeId: params.sedeId,
      servicioId: params.servicioId,
      fecha: params.fecha,
      profesionalId: params.profesionalId,
      duracionExtraMinutos,
    });
    const slotElegido = slots.find((s) => s.hora_inicio === params.horaInicioISO);
    if (!slotElegido) {
      throw new ReservaError(
        "Ese horario ya no está disponible. Por favor, elige otra hora."
      );
    }
    profesionalIdElegido = slotElegido.profesional_id;
    profesionalNombreElegido = slotElegido.profesional_nombre;
    inicio = new Date(params.horaInicioISO);
    fin = addMinutes(inicio, duracionMinutos);
  }

  // Total de la cita (servicio + complementos) — el mismo número que ve
  // el cliente en el paso de confirmación de app/reservar. sede_servicios
  // tiene una columna de precio propia por sede que hoy no se usa en
  // ningún otro sitio de la app (tampoco en los informes de facturación),
  // así que el saldo de fidelización sigue ese mismo criterio para no
  // introducir una fuente de verdad distinta.
  const precioServicioCentimos = servicio?.precio_centimos ?? 0;
  const totalCentimos =
    precioServicioCentimos + complementosParaGuardar.reduce((acc, c) => acc + c.precio_centimos, 0);

  // 1. Encontrar o crear el cliente por teléfono (mismo criterio que usa
  // el registro de cuenta con contraseña y el alta manual desde el
  // panel — ver lib/clientes.ts — para que siempre casen con el mismo
  // historial, venga la reserva de donde venga).
  const { clienteId, esNuevo } = await buscarOCrearCliente(supabase, {
    nombre: params.cliente.nombre,
    telefono: params.cliente.telefono,
    email: params.cliente.email,
    sedeId: params.sedeId,
  });

  if (esNuevo) {
    // Consentimiento operativo: implícito al usar el servicio, se registra
    // igualmente para trazabilidad (ver sección 8 del documento de
    // especificación / RGPD).
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "operativo",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_OPERATIVO,
    });
  }

  if (params.aceptaComercial) {
    await supabase.from("consentimientos").insert({
      cliente_id: clienteId,
      tipo: "comercial",
      canal: params.canal,
      texto_aceptado: TEXTO_CONSENTIMIENTO_COMERCIAL,
    });
  }

  // Si el cliente quiere pagar con su saldo de fidelización, se comprueba
  // ANTES de crear la cita que le cubre el total exacto — no se admite
  // canje parcial ("descontar" solo una parte no está permitido). Esto
  // evita crear y tener que deshacer la cita en el caso normal; el canje
  // real (más abajo) se vuelve a comprobar en la propia base de datos por
  // si el saldo cambiase justo en medio, por ejemplo por otra reserva
  // simultánea del mismo cliente.
  if (params.pagarConSaldo) {
    const saldoActual = await saldoDelCliente(supabase, clienteId);
    if (saldoActual < totalCentimos) {
      throw new ReservaError("El saldo acumulado no cubre el total de esta cita.");
    }
  }

  // 2. Crear la cita
  const { data: cita, error: errorCita } = await supabase
    .from("citas")
    .insert({
      cliente_id: clienteId,
      sede_id: params.sedeId,
      profesional_id: profesionalIdElegido,
      servicio_id: params.servicioId,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      origen: params.origen,
      notas: notaComplementos,
      saldo_canjeado_centimos: params.pagarConSaldo ? totalCentimos : 0,
      profesional_elegido_por_cliente: params.profesionalElegidoPorCliente ?? false,
    })
    .select("*")
    .single();

  if (errorCita || !cita) {
    throw new ReservaError("No se pudo crear la cita. Inténtalo de nuevo.");
  }

  if (complementosParaGuardar.length > 0) {
    await supabase.from("cita_extras").insert(
      complementosParaGuardar.map((c) => ({ cita_id: cita.id, ...c }))
    );
  }

  if (params.pagarConSaldo && totalCentimos > 0) {
    try {
      await canjearSaldoEnCita(supabase, { clienteId, citaId: cita.id, importeCentimos: totalCentimos });
    } catch (err) {
      // El saldo dejó de alcanzar justo entre la comprobación de arriba y
      // este momento (carrera muy poco probable, pero posible). Se
      // deshace la cita recién creada (cita_extras se borra en cascada)
      // en vez de dejarla creada sin haberse cobrado de verdad.
      await supabase.from("citas").delete().eq("id", cita.id);
      if (err instanceof SaldoInsuficienteError) {
        throw new ReservaError("El saldo acumulado no cubre el total de esta cita.");
      }
      throw err;
    }
  }

  // Si este cliente estaba apuntado a la lista de espera para este mismo
  // día, sede y servicio, la reserva ya está hecha: se marca como resuelta
  // en vez de dejarla "pendiente" (o "notificada") para siempre.
  await supabase
    .from("lista_espera")
    .update({ estado: "reservado" })
    .eq("cliente_id", clienteId)
    .eq("sede_id", params.sedeId)
    .eq("servicio_id", params.servicioId)
    .eq("fecha", params.fecha)
    .in("estado", ["pendiente", "notificado"]);

  // Copia la ficha del cliente y la cita nueva a HubSpot (CRM externo de
  // Diego). Estas funciones nunca lanzan: si HubSpot falla o no está
  // configurado, la reserva ya está hecha en Supabase igualmente.
  await sincronizarClienteHubSpot(supabase, clienteId);
  await sincronizarCitaHubSpot(supabase, cita.id);

  return { cita, clienteId, profesionalNombre: profesionalNombreElegido };
}

/**
 * Minutos de antelación mínimos para que el propio cliente pueda cancelar
 * o reprogramar su cita por WhatsApp sin intervención humana (política de
 * Diego: por debajo de este margen, la IA no lo hace sola y pide que
 * llamen a la barbería). El panel de administración no tiene este límite:
 * un gestor humano puede cancelar/mover cualquier cita en cualquier
 * momento desde /admin/dashboard.
 */
export const MINUTOS_MINIMOS_CANCELACION_AUTOMATICA = 60;

export function puedeGestionarseAutomaticamente(inicioISO: string): boolean {
  const minutosHastaLaCita = (new Date(inicioISO).getTime() - Date.now()) / 60000;
  return minutosHastaLaCita >= MINUTOS_MINIMOS_CANCELACION_AUTOMATICA;
}

/**
 * Cancela una cita ya existente. Usado tanto por el asistente de WhatsApp
 * (con el límite de la 1 hora ya comprobado antes de llamar a esto) como,
 * en el futuro, por otros puntos de entrada.
 */
export async function cancelarCita(citaId: string) {
  const supabase = createAdminClient();
  const { data: cita, error } = await supabase
    .from("citas")
    .update({ estado: "cancelada" })
    .eq("id", citaId)
    .select("*")
    .single();
  if (error || !cita) throw new ReservaError("No se pudo cancelar la cita.");
  await sincronizarCitaHubSpot(supabase, cita.id);
  await asignarListaEsperaPorHueco(cita);
  // Si esta cita se había pagado con saldo de fidelización, se le
  // devuelve íntegro al cliente: cancelar no debería costarle el saldo
  // que ya tenía ganado.
  await reembolsarSaldoDeCita(supabase, cita);
  return cita;
}

interface ReprogramarCitaParams {
  citaId: string;
  nuevaHoraInicioISO: string;
  // Si no se indica, se mantiene el mismo profesional/sede/servicio y solo
  // cambia el horario; getAvailableSlots decide igualmente qué profesional
  // atiende si el original no está libre a esa hora.
  profesionalId?: string | null;
}

/**
 * Mueve una cita existente a un nuevo horario, comprobando disponibilidad
 * real igual que al crearla (evita dobles reservas).
 */
export async function reprogramarCita({ citaId, nuevaHoraInicioISO, profesionalId }: ReprogramarCitaParams) {
  const supabase = createAdminClient();
  const { data: citaActual } = await supabase.from("citas").select("*").eq("id", citaId).single();
  if (!citaActual) throw new ReservaError("No se encontró la cita.");

  const duracionMinutos = Math.round(
    (new Date(citaActual.fin).getTime() - new Date(citaActual.inicio).getTime()) / 60000
  );

  const fecha = new Date(nuevaHoraInicioISO).toISOString().slice(0, 10);
  const slots = await getAvailableSlots({
    sedeId: citaActual.sede_id,
    servicioId: citaActual.servicio_id,
    fecha,
    profesionalId: profesionalId ?? citaActual.profesional_id,
    duracionExtraMinutos: 0,
  });

  // La duración total (servicio + complementos) ya está fijada en la cita
  // original; buscamos un hueco de esa misma duración exacta a partir de
  // los slots que ofrece el motor de disponibilidad (que asume la
  // duración base del servicio) comprobando que, extendido, no choca.
  const slotElegido = slots.find((s) => s.hora_inicio === nuevaHoraInicioISO);
  if (!slotElegido) {
    throw new ReservaError("Ese horario ya no está disponible. Elige otra hora.");
  }

  const nuevoInicio = new Date(nuevaHoraInicioISO);
  const nuevoFin = addMinutes(nuevoInicio, duracionMinutos);

  const { data: citaActualizada, error } = await supabase
    .from("citas")
    .update({
      inicio: nuevoInicio.toISOString(),
      fin: nuevoFin.toISOString(),
      profesional_id: slotElegido.profesional_id,
      recordatorio_enviado_at: null, // si ya se había mandado, que se vuelva a mandar para la nueva hora
    })
    .eq("id", citaId)
    .select("*")
    .single();

  if (error || !citaActualizada) throw new ReservaError("No se pudo reprogramar la cita.");
  await sincronizarCitaHubSpot(supabase, citaActualizada.id);
  return { cita: citaActualizada, profesionalNombre: slotElegido.profesional_nombre };
}

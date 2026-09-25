"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fechaEnMadrid,
  minutosEnMadrid,
  minutosDeHora,
  isoDesdeMadrid,
} from "@/lib/horarioLocal";
import {
  columnasVisibles,
  rangoHorario,
  resolverDescansosDia,
  ID_SIN_ASIGNAR,
} from "@/lib/calendarioDia";
import {
  IconBell,
  IconCheck,
  IconAlertCircle,
  IconX,
} from "@/components/ui/Icons";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";

interface Cita {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  origen: string;
  profesional_elegido_por_cliente?: boolean;
  metodo_pago?: string | null;
  cliente: { id: string; nombre: string; telefono: string | null } | null;
  servicio: { id: string; nombre: string; color?: string | null } | null;
  profesional: { id: string; nombre: string; foto_url?: string | null } | null;
  // Complementos añadidos al servicio principal (ver lib/booking.ts),
  // igual que en AgendaClient.tsx — "servicio" puede llegar como objeto o
  // array suelto según cómo Supabase resuelva la relación anidada.
  extras?: { servicio_id: string; servicio: { nombre: string } | { nombre: string }[] | null }[];
}

// Nombres de los complementos de una cita, listos para mostrar.
function nombresExtras(cita: Cita): string[] {
  return (cita.extras ?? [])
    .map((ex) => (Array.isArray(ex.servicio) ? ex.servicio[0] : ex.servicio))
    .map((s) => s?.nombre)
    .filter((n): n is string => Boolean(n));
}
interface Profesional {
  id: string;
  nombre: string;
  foto_url?: string | null;
}
interface Horario {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
  descanso_inicio?: string | null;
  descanso_fin?: string | null;
}
interface DescansoExcepcion {
  profesional_id: string;
  hora_inicio: string;
  hora_fin: string;
}
interface BloqueoAgenda {
  id: string;
  profesional_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
}
interface ServicioOpcion {
  id: string;
  nombre: string;
  duracion_minutos: number;
}

// Estado de la búsqueda por teléfono en "Nueva cita" (ver MenuCreacion):
// igual que en el botón flotante NuevaCitaRapida.tsx, solo se pide el
// nombre cuando el teléfono no coincide con ningún cliente ya existente.
type EstadoClienteRapido =
  | { tipo: "vacio" }
  | { tipo: "buscando" }
  | { tipo: "encontrado"; nombre: string }
  | { tipo: "nuevo" };

function horaDeMinutos(min: number) {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  no_presentada: "No presentada",
};

// Densidad del calendario: 1,6px por minuto = 96px por hora — suficiente
// para leer un hueco de 15 minutos sin que un día de 12 horas se vuelva
// interminable de desplazar.
const PX_POR_MINUTO = 1.6;
const ALTURA_MINIMA_BLOQUE = 24;

// Franja rayada antes de la apertura y después del cierre: solo para que
// se note visualmente dónde no hay turno mientras se navega la Agenda
// (pedido de Diego, 19/09/2026) — nunca se puede arrastrar una cita o un
// descanso hasta ahí (los límites de arrastre siguen siendo minInicio y
// maxFin, sin tocar). 60 minutos de margen a cada lado, recortado a un
// día real (0-1440) para no salirse del eje en un turno que ya empiece a
// las 00:00 o termine a las 23:xx.
const BUFFER_VISUAL_MIN = 60;
const MINUTOS_POR_DIA = 24 * 60;

function formatoHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

// Color por defecto para una cita cuyo servicio no tiene color asignado
// (no debería pasar con servicios dados de alta desde ahora, pero cubre
// datos antiguos o un color vacío a mano).
const COLOR_SERVICIO_POR_DEFECTO = "#a8a29e"; // stone-400

/**
 * Clases fijas del bloque de una cita según su estado — el color de
 * fondo/borde ya no depende del estado (eso ahora lo indican los iconos
 * de tick verde y "!"), sino del servicio (ver `estiloColorServicio`),
 * para que la Agenda funcione como una leyenda de colores por servicio.
 * "cancelada" es la única excepción: se tacha y se apaga del todo, da
 * igual el servicio, porque esa cita ya no representa nada que vaya a
 * pasar.
 */
function claseBloque(estado: string) {
  if (estado === "cancelada") {
    return "border-red-200 bg-red-50 text-red-400 line-through opacity-70 hover:opacity-100";
  }
  return "text-stone-900 hover:brightness-95";
}

/** Fondo/borde de una cita a partir del color hex de su servicio. */
function estiloColorServicio(
  color: string | null | undefined,
): React.CSSProperties {
  const hex = color || COLOR_SERVICIO_POR_DEFECTO;
  return { backgroundColor: `${hex}26`, borderColor: `${hex}80` };
}

/**
 * Vista de día en formato calendario: una columna por barbero, el eje de
 * horas a la izquierda, y una línea que avanza en vivo con la hora
 * actual — igual que cualquier calendario de citas. Sustituye a la
 * lista plana que había antes; los detalles y acciones de cada cita
 * (completar, avisar disponible...) viven ahora en un panel que se abre
 * al pulsar el bloque, porque un hueco de 15-20 minutos no tiene sitio
 * para botones dentro.
 */
export default function CalendarioDia({
  sedeId,
  fecha,
  citas,
  profesionales,
  horarios,
  descansosExcepciones,
  bloqueos,
  servicios,
  esAdmin,
  profesionalIdPropio,
  cargando,
  onFinalizar,
  onCambiarEstado,
  onAvisarDisponible,
  onDescansoMovido,
  onMoverCita,
  onCreado,
  avisando,
}: {
  sedeId: string;
  fecha: string;
  citas: Cita[];
  profesionales: Profesional[];
  horarios: Horario[];
  descansosExcepciones: DescansoExcepcion[];
  bloqueos: BloqueoAgenda[];
  servicios: ServicioOpcion[];
  esAdmin: boolean;
  // Ficha de barbero de la propia cuenta (null para el admin, o si la
  // cuenta no tiene una vinculada) — para saber si un bloqueo/vacación es
  // "propio" y por tanto se le puede mostrar el motivo y editarlo (ver
  // bloqueosPorColumna más abajo). Un barbero nunca ve el motivo del
  // bloqueo de un compañero, solo que esa franja está ocupada.
  profesionalIdPropio: string | null;
  cargando: boolean;
  onFinalizar: (cita: Cita) => void;
  onCambiarEstado: (id: string, estado: string) => void;
  onAvisarDisponible: (id: string) => void;
  onDescansoMovido: () => void;
  onMoverCita: (id: string, nuevoInicioISO: string) => Promise<void> | void;
  // Se llama tras crear una cita o un bloqueo de agenda desde el
  // arrastre (ver iniciarCreacion más abajo) para que el padre recargue
  // la Agenda — igual que onDescansoMovido.
  onCreado: () => void;
  avisando: string | null;
}) {
  const [seleccionada, setSeleccionada] = useState<Cita | null>(null);
  const [bloqueoEditando, setBloqueoEditando] = useState<{
    id: string;
    profesionalNombre: string;
    horaInicio: string;
    horaFin: string;
    motivo: string | null;
  } | null>(null);

  // Columnas a mostrar: los profesionales que trabajan ese día (tienen
  // horario) o que ya tienen alguna cita ese día, aunque no les tocara
  // turno (una cita puesta a mano, o un profesional que cubre a otro).
  // Si hay alguna cita sin profesional asignado ("cualquiera" al
  // reservar), se añade una columna aparte para no perderla de vista.
  const columnas = useMemo(
    () => columnasVisibles(profesionales, horarios, citas),
    [profesionales, horarios, citas],
  );

  const citasPorColumna = useMemo(() => {
    const mapa = new Map<string, Cita[]>();
    for (const c of citas) {
      const clave = c.profesional?.id ?? ID_SIN_ASIGNAR;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(c);
    }
    return mapa;
  }, [citas]);

  // Descanso para comer que le toca a cada barbero ese día concreto (la
  // excepción puntual arrastrada, si existe, si no la regla general de su
  // horario) — se pinta como un bloque oscuro no reservable.
  const descansoPorColumna = useMemo(() => {
    const resueltos = resolverDescansosDia(horarios, descansosExcepciones);
    return new Map(resueltos.map((d) => [d.profesional_id, d]));
  }, [horarios, descansosExcepciones]);

  // Bloqueos de agenda de cada barbero que caen (aunque sea en parte) en
  // este día: un bloqueo puntual creado arrastrando (ver iniciarCreacion
  // más abajo), o unas vacaciones/festivo de ESE barbero que empiecen
  // antes o terminen después de hoy — en ese caso se recorta a las
  // 00:00/24:00 de este día, para no calcular minutos de otra fecha.
  const bloqueosPorColumna = useMemo(() => {
    const mapa = new Map<
      string,
      {
        id: string;
        motivo: string | null;
        desdeMin: number;
        hastaMin: number;
        // Un bloqueo de franja horaria concreta (creado arrastrando, ver
        // iniciarCreacion) se puede reabrir para corregir sus horas
        // exactas; uno de día completo (vacaciones/festivo, desde la
        // pantalla de Bloqueos) no — ese se gestiona por día entero desde
        // ahí, no tiene "horas" que editar aquí.
        esTiempoPreciso: boolean;
      }[]
    >();
    for (const b of bloqueos) {
      const desdeMin =
        fechaEnMadrid(b.fecha_inicio) < fecha
          ? 0
          : minutosEnMadrid(b.fecha_inicio);
      const hastaMin =
        fechaEnMadrid(b.fecha_fin) > fecha
          ? MINUTOS_POR_DIA
          : minutosEnMadrid(b.fecha_fin);
      if (hastaMin <= desdeMin) continue;
      if (!mapa.has(b.profesional_id)) mapa.set(b.profesional_id, []);
      mapa.get(b.profesional_id)!.push({
        id: b.id,
        motivo: b.motivo,
        desdeMin,
        hastaMin,
        esTiempoPreciso: !(desdeMin === 0 && hastaMin === MINUTOS_POR_DIA),
      });
    }
    return mapa;
  }, [bloqueos, fecha]);

  // Arrastre del bloque de descanso (solo admin): mientras se arrastra se
  // guarda aquí una vista previa en minutos; al soltar se persiste como
  // excepción de ESE día concreto (no cambia la regla general) y se
  // recarga la agenda.
  const [arrastrando, setArrastrando] = useState<{
    profesionalId: string;
    inicioMin: number;
    duracionMin: number;
  } | null>(null);
  const [guardandoDescanso, setGuardandoDescanso] = useState(false);

  function iniciarArrastreDescanso(
    e: React.PointerEvent,
    profesionalId: string,
    inicioMin: number,
    finMin: number,
    limiteInicio: number,
    limiteFin: number,
  ) {
    if (!esAdmin || guardandoDescanso) return;
    e.preventDefault();
    e.stopPropagation();
    const duracionMin = finMin - inicioMin;
    const yInicial = e.clientY;

    function alMover(ev: PointerEvent) {
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicio = Math.min(
        Math.max(inicioMin + snapMin, limiteInicio),
        limiteFin - duracionMin,
      );
      setArrastrando({ profesionalId, inicioMin: nuevoInicio, duracionMin });
    }
    async function alSoltar(ev: PointerEvent) {
      limpiar();
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicio = Math.min(
        Math.max(inicioMin + snapMin, limiteInicio),
        limiteFin - duracionMin,
      );
      setArrastrando(null);
      if (nuevoInicio === inicioMin) return; // no se movió, nada que guardar
      setGuardandoDescanso(true);
      try {
        await fetch(
          `/api/admin/profesionales/${profesionalId}/descanso-excepcion`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sedeId,
              fecha,
              horaInicio: horaDeMinutos(nuevoInicio),
              horaFin: horaDeMinutos(nuevoInicio + duracionMin),
            }),
          },
        );
        onDescansoMovido();
      } finally {
        setGuardandoDescanso(false);
      }
    }
    // Un gesto táctil interrumpido (llamada entrante, gesto del sistema)
    // no debe guardar nada — se descarta tal cual, sin intentar mover el
    // descanso a la última posición conocida.
    function alCancelar() {
      limpiar();
      setArrastrando(null);
    }
    function limpiar() {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alCancelar);
    }

    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alCancelar);
  }

  // Arrastre de una cita para cambiarla de hora (solo admin, y solo
  // dentro de la misma columna/profesional — mover de barbero no es lo
  // que pidió Diego, solo la hora). Mismo patrón que el arrastre del
  // descanso de arriba: mientras se arrastra se guarda una vista previa
  // en minutos, y al soltar se llama a onMoverCita (PATCH
  // /api/admin/citas/[id] con horaInicioISO), que ya comprueba que no
  // choque con otra cita de ese profesional.
  //
  // Distinguir "fue un click" de "fue un arrastre": un mousedown seguido
  // de un mouseup sin apenas movimiento debe abrir el panel de detalle
  // (el onClick normal del botón), no disparar una llamada a mover la
  // cita de 0 minutos. Se guarda en un ref (no en estado) si hubo
  // movimiento real, y el onClick de la cita lo consulta antes de abrir
  // el panel — el click llega justo después del mouseup, así que el ref
  // ya está actualizado para cuando se lee.
  const [arrastrandoCita, setArrastrandoCita] = useState<{
    citaId: string;
    profesionalId: string;
    inicioMin: number;
    duracionMin: number;
  } | null>(null);
  const [moviendoCitaId, setMoviendoCitaId] = useState<string | null>(null);
  const ultimoArrastreCitaRef = useRef(false);
  const UMBRAL_ARRASTRE_PX = 4;

  function iniciarArrastreCita(
    e: React.PointerEvent,
    cita: Cita,
    limiteInicio: number,
    limiteFin: number,
  ) {
    if (!esAdmin || cita.estado !== "confirmada" || moviendoCitaId) return;
    if (!cita.profesional?.id) return; // "Sin asignar": no tiene sentido arrastrarla dentro de esa columna
    const profesionalId: string = cita.profesional.id; // ya con tipo no-opcional, para que las funciones anidadas de más abajo no lo vuelvan a ver como "string | undefined"
    e.preventDefault();
    e.stopPropagation();
    ultimoArrastreCitaRef.current = false;
    const inicioMinOriginal = minutosEnMadrid(cita.inicio);
    const duracionMin = minutosEnMadrid(cita.fin) - inicioMinOriginal;
    const yInicial = e.clientY;

    function alMover(ev: PointerEvent) {
      if (Math.abs(ev.clientY - yInicial) > UMBRAL_ARRASTRE_PX)
        ultimoArrastreCitaRef.current = true;
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicio = Math.min(
        Math.max(inicioMinOriginal + snapMin, limiteInicio),
        limiteFin - duracionMin,
      );
      setArrastrandoCita({
        citaId: cita.id,
        profesionalId,
        inicioMin: nuevoInicio,
        duracionMin,
      });
    }
    async function alSoltar(ev: PointerEvent) {
      limpiar();
      setArrastrandoCita(null);
      if (!ultimoArrastreCitaRef.current) {
        // Fue un toque/clic sin arrastre real: se abre el detalle desde
        // aquí mismo en vez de fiarse solo del onClick nativo del botón,
        // porque un pointerdown con preventDefault no siempre deja pasar
        // el click sintetizado en pantallas táctiles. En ratón, el onClick
        // normal del botón también llegará justo después — llamarlo dos
        // veces con la misma cita no hace nada raro.
        setSeleccionada(cita);
        return;
      }
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicioMin = Math.min(
        Math.max(inicioMinOriginal + snapMin, limiteInicio),
        limiteFin - duracionMin,
      );
      if (nuevoInicioMin === inicioMinOriginal) return; // soltada en el mismo sitio
      setMoviendoCitaId(cita.id);
      try {
        await onMoverCita(
          cita.id,
          isoDesdeMadrid(fecha, horaDeMinutos(nuevoInicioMin)),
        );
      } finally {
        setMoviendoCitaId(null);
      }
    }
    // Gesto interrumpido: se descarta sin mover ni abrir nada.
    function alCancelar() {
      limpiar();
      setArrastrandoCita(null);
    }
    function limpiar() {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alCancelar);
    }

    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alCancelar);
  }

  // Crear algo nuevo arrastrando sobre un hueco vacío de la agenda —
  // disponible para admin Y barberos (a diferencia de los arrastres de
  // arriba, que mueven algo ya existente y siguen siendo solo admin).
  // El bloque sale siempre con DURACION_BLOQUEO_DEFECTO_MIN (30 min, lo
  // normal para un bloqueo) y, mientras se sigue arrastrando, se mueve
  // ENTERO (no se alarga ni se encoge) a donde esté el dedo/cursor, en
  // pasos de 5 minutos (PASO_CREACION_MIN) — igual que arrastrar una cita
  // o el descanso para cambiarlos de hora. Ajustar la duración exacta del
  // bloqueo se hace después, ya creado (ver EditarBloqueoModal); para una
  // cita la duración del rectángulo no importa, la fija el servicio
  // elegido en el propio formulario.
  //
  // En pantallas táctiles, el gesto no empieza hasta mantener pulsado
  // ESPERA_PULSACION_LARGA_MS sin apenas moverse (pedido de Diego,
  // 25/09/2026: antes reaccionaba a cualquier roce y no dejaba hacer
  // scroll por la agenda). Si en ese tiempo el dedo se desplaza más de
  // UMBRAL_CANCELAR_ESPERA_PX, se entiende que es un gesto de scroll/pan
  // normal: se cancela la espera y el propio navegador se encarga de
  // moverse por la pantalla (la columna deja pasar el scroll vertical
  // nativo — ver className="touch-pan-y" más abajo — así que ni falta
  // cancelar nada a mano en ese caso, el navegador manda un pointercancel
  // solo). Con ratón o lápiz no hay ninguna espera: el arrastre empieza
  // al instante, como siempre.
  const PASO_CREACION_MIN = 5;
  const DURACION_BLOQUEO_DEFECTO_MIN = 30;
  const ESPERA_PULSACION_LARGA_MS = 500;
  const UMBRAL_CANCELAR_ESPERA_PX = 10;
  const [creacion, setCreacion] = useState<{
    profesionalId: string;
    inicioMin: number;
    finMin: number;
    fase: "arrastrando" | "menu" | "bloqueo" | "cita";
  } | null>(null);

  function iniciarCreacion(
    e: React.PointerEvent<HTMLDivElement>,
    profesionalId: string,
    limiteInicio: number,
    limiteFin: number,
  ) {
    if (e.button !== 0 || creacion || moviendoCitaId || guardandoDescanso)
      return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xInicial = e.clientX;
    const yInicial = e.clientY;
    let confirmado = false;
    let idTimer: number | undefined;

    function calcularInicioMin(clientY: number) {
      const minutoClic = minInicioVisual + (clientY - rect.top) / PX_POR_MINUTO;
      return Math.min(
        Math.max(
          Math.round(minutoClic / PASO_CREACION_MIN) * PASO_CREACION_MIN,
          limiteInicio,
        ),
        Math.max(limiteInicio, limiteFin - DURACION_BLOQUEO_DEFECTO_MIN),
      );
    }

    const inicioBase = calcularInicioMin(yInicial);

    function empezarDeVerdad() {
      confirmado = true;
      setCreacion({
        profesionalId,
        inicioMin: inicioBase,
        finMin: Math.min(inicioBase + DURACION_BLOQUEO_DEFECTO_MIN, limiteFin),
        fase: "arrastrando",
      });
      window.addEventListener("pointermove", alMoverArrastre);
    }

    function alMoverArrastre(ev: PointerEvent) {
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / PASO_CREACION_MIN) * PASO_CREACION_MIN;
      const inicioMin = Math.min(
        Math.max(inicioBase + snapMin, limiteInicio),
        Math.max(limiteInicio, limiteFin - DURACION_BLOQUEO_DEFECTO_MIN),
      );
      setCreacion((actual) =>
        actual && actual.fase === "arrastrando"
          ? { ...actual, inicioMin, finMin: inicioMin + DURACION_BLOQUEO_DEFECTO_MIN }
          : actual,
      );
    }

    // Mientras se espera a que se cumpla la pulsación larga (solo táctil):
    // si el dedo se mueve de verdad, es un scroll, no una creación — se
    // cancela la espera sin crear nada.
    function alMoverEspera(ev: PointerEvent) {
      if (confirmado) return;
      const distancia = Math.hypot(ev.clientX - xInicial, ev.clientY - yInicial);
      if (distancia > UMBRAL_CANCELAR_ESPERA_PX) {
        window.clearTimeout(idTimer);
        limpiar();
      }
    }
    function alSoltar() {
      window.clearTimeout(idTimer);
      limpiar();
      if (!confirmado) return; // se soltó antes de cumplirse la pulsación larga: no crear nada
      setCreacion((actual) =>
        actual && actual.fase === "arrastrando"
          ? { ...actual, fase: "menu" }
          : null,
      );
    }
    function alCancelar() {
      window.clearTimeout(idTimer);
      limpiar();
      if (confirmado) setCreacion(null);
    }
    function limpiar() {
      window.removeEventListener("pointermove", alMoverEspera);
      window.removeEventListener("pointermove", alMoverArrastre);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alCancelar);
    }

    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alCancelar);

    if (e.pointerType === "touch") {
      // Solo táctil: espera la pulsación larga, vigilando que no se mueva.
      // A propósito NO se llama a preventDefault aquí — el scroll vertical
      // nativo tiene que poder arrancar libremente si el dedo se mueve
      // (className="touch-pan-y" en la columna es quien lo permite); si
      // eso pasa, el propio navegador cancela este puntero solo.
      window.addEventListener("pointermove", alMoverEspera);
      idTimer = window.setTimeout(empezarDeVerdad, ESPERA_PULSACION_LARGA_MS);
    } else {
      // Ratón o lápiz: empieza al instante, como siempre.
      e.preventDefault();
      empezarDeVerdad();
    }
  }

  // Rango de horas a mostrar: el de los turnos de ese día si hay alguno,
  // si no el de las citas ya puestas, y si tampoco hay nada, un horario
  // razonable por defecto — para que un día vacío no se quede sin eje.
  const { minInicio, maxFin } = useMemo(() => {
    const citasConMinutos = citas.map((c) => ({
      desdeMin: minutosEnMadrid(c.inicio),
      hastaMin: minutosEnMadrid(c.fin),
    }));
    return rangoHorario(
      columnas.map((c) => c.id),
      horarios,
      citasConMinutos,
    );
  }, [horarios, citas, columnas]);

  // Rango VISUAL: igual que minInicio/maxFin pero con un margen a cada
  // lado, solo para saber dónde pintar (altura, marcas de hora, línea de
  // "ahora", franjas rayadas). minInicio/maxFin en sí no cambian — siguen
  // siendo los límites de arrastre de citas y descansos, se pasan tal
  // cual a iniciarArrastreCita/iniciarArrastreDescanso más abajo.
  const minInicioVisual = Math.max(0, minInicio - BUFFER_VISUAL_MIN);
  const maxFinVisual = Math.min(MINUTOS_POR_DIA, maxFin + BUFFER_VISUAL_MIN);

  const alturaTotal = (maxFinVisual - minInicioVisual) * PX_POR_MINUTO;

  const marcas = useMemo(() => {
    const lista: number[] = [];
    for (let m = minInicioVisual; m <= maxFinVisual; m += 30) lista.push(m);
    return lista;
  }, [minInicioVisual, maxFinVisual]);

  // Línea de "ahora": solo si se está mirando el día de hoy (comparado
  // en hora de Madrid, no en la del servidor, para que no se desajuste
  // justo después de medianoche). Se actualiza sola cada 30 segundos.
  const [ahoraISO, setAhoraISO] = useState(() => new Date().toISOString());
  const esHoy = fecha === fechaEnMadrid(ahoraISO);
  useEffect(() => {
    const id = setInterval(() => setAhoraISO(new Date().toISOString()), 30_000);
    return () => clearInterval(id);
  }, []);
  const ahoraMin = minutosEnMadrid(ahoraISO);
  const posicionAhora = Math.min(
    Math.max(ahoraMin, minInicioVisual),
    maxFinVisual,
  );

  if (cargando && citas.length === 0) {
    return <p className="text-sm text-stone-500">Cargando…</p>;
  }
  if (columnas.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No hay ningún barbero de turno ese día en esta sede.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 64 + columnas.length * 160 }}>
          {/* --- Cabecera: nombre de cada barbero --- */}
          <div className="sticky top-0 z-20 flex border-b border-stone-200 bg-white">
            <div className="w-16 shrink-0" />
            {columnas.map((col) => (
              <div
                key={col.id}
                className="flex flex-1 items-center justify-center gap-1.5 border-l border-stone-100 p-2 text-center text-sm font-medium text-stone-900"
              >
                {col.id !== ID_SIN_ASIGNAR && (
                  <AvatarProfesional
                    fotoUrl={col.foto_url}
                    nombre={col.nombre}
                    className="h-5 w-5"
                  />
                )}
                {col.nombre}
              </div>
            ))}
          </div>

          {/* --- Cuerpo: eje de horas + una columna por barbero --- */}
          <div className="max-h-[75vh] overflow-y-auto">
            <div className="relative flex" style={{ height: alturaTotal }}>
              <div className="sticky left-0 z-10 w-16 shrink-0 bg-white">
                {marcas.map((m) => (
                  <div
                    key={m}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-stone-400"
                    style={{ top: (m - minInicioVisual) * PX_POR_MINUTO }}
                  >
                    {String(Math.floor(m / 60)).padStart(2, "0")}:
                    {String(m % 60).padStart(2, "0")}
                  </div>
                ))}
              </div>

              {columnas.map((col) => (
                <div
                  key={col.id}
                  onPointerDown={
                    col.id !== ID_SIN_ASIGNAR
                      ? (e) => iniciarCreacion(e, col.id, minInicio, maxFin)
                      : undefined
                  }
                  onContextMenu={(e) => e.preventDefault()}
                  className={
                    // touch-pan-y (no touch-none): deja que el scroll
                    // vertical nativo funcione con normalidad al arrastrar
                    // el dedo por la columna — la creación de un bloque
                    // nuevo solo se activa con una pulsación larga sin
                    // apenas movimiento (ver iniciarCreacion más arriba).
                    "relative flex-1 touch-pan-y border-l border-stone-100" +
                    (col.id !== ID_SIN_ASIGNAR ? " cursor-crosshair" : "")
                  }
                >
                  {/* Franjas "cerrado" (antes de abrir / después de cerrar): puramente
                      visuales, con rayado, para orientarse — nunca se puede arrastrar
                      nada hasta aquí (los límites de arrastre siguen siendo minInicio
                      y maxFin, no minInicioVisual/maxFinVisual). */}
                  {minInicioVisual < minInicio && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-0"
                      style={{
                        top: 0,
                        height: (minInicio - minInicioVisual) * PX_POR_MINUTO,
                        backgroundImage:
                          "repeating-linear-gradient(135deg, rgba(120,113,108,0.16) 0, rgba(120,113,108,0.16) 6px, transparent 6px, transparent 12px)",
                      }}
                    />
                  )}
                  {maxFinVisual > maxFin && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-0"
                      style={{
                        top: (maxFin - minInicioVisual) * PX_POR_MINUTO,
                        height: (maxFinVisual - maxFin) * PX_POR_MINUTO,
                        backgroundImage:
                          "repeating-linear-gradient(135deg, rgba(120,113,108,0.16) 0, rgba(120,113,108,0.16) 6px, transparent 6px, transparent 12px)",
                      }}
                    />
                  )}

                  {marcas.map((m) => (
                    <div
                      key={m}
                      className={
                        "absolute inset-x-0 border-t " +
                        (m % 60 === 0 ? "border-stone-200" : "border-stone-100")
                      }
                      style={{ top: (m - minInicioVisual) * PX_POR_MINUTO }}
                    />
                  ))}

                  {esHoy && (
                    <div
                      className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                      style={{
                        top: (posicionAhora - minInicioVisual) * PX_POR_MINUTO,
                      }}
                    >
                      <div className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-red-500" />
                    </div>
                  )}

                  {(() => {
                    const descanso = descansoPorColumna.get(col.id);
                    if (!descanso) return null;
                    const enArrastre = arrastrando?.profesionalId === col.id;
                    const desde = enArrastre
                      ? arrastrando!.inicioMin
                      : minutosDeHora(descanso.hora_inicio);
                    const hasta = enArrastre
                      ? arrastrando!.inicioMin + arrastrando!.duracionMin
                      : minutosDeHora(descanso.hora_fin);
                    const top = (desde - minInicioVisual) * PX_POR_MINUTO;
                    const alto = (hasta - desde) * PX_POR_MINUTO;
                    return (
                      <div
                        key="descanso"
                        onPointerDown={(e) => {
                          // Siempre se para aquí, incluso cuando la función de abajo no
                          // hace nada (barbero, sin permiso): si no, el pointerdown seguiría
                          // subiendo hasta la columna y dispararía por error una creación
                          // nueva justo encima del descanso.
                          e.stopPropagation();
                          iniciarArrastreDescanso(
                            e,
                            col.id,
                            minutosDeHora(descanso.hora_inicio),
                            minutosDeHora(descanso.hora_fin),
                            minInicio,
                            maxFin,
                          );
                        }}
                        className={
                          "absolute inset-x-0 z-10 flex touch-none items-center justify-center border-y border-stone-700 bg-stone-800/90 text-[11px] font-medium text-white " +
                          (esAdmin
                            ? "cursor-grab select-none active:cursor-grabbing"
                            : "")
                        }
                        style={{ top, height: alto }}
                        title={
                          esAdmin
                            ? "Descanso — arrástralo para moverlo solo este día"
                            : "Descanso"
                        }
                      >
                        Descanso {horaDeMinutos(desde)}–{horaDeMinutos(hasta)}
                        {descanso.esExcepcion && " *"}
                      </div>
                    );
                  })()}

                  {(bloqueosPorColumna.get(col.id) ?? []).map((b) => {
                    const top = (b.desdeMin - minInicioVisual) * PX_POR_MINUTO;
                    const alto = (b.hastaMin - b.desdeMin) * PX_POR_MINUTO;
                    // Un barbero solo ve el motivo (y puede editar/tocar
                    // para abrir el detalle) de SUS PROPIOS bloqueos —
                    // nunca el de un compañero, aunque sea admin quien lo
                    // creó (pedido de Diego, 25/09/2026: "no quiero que un
                    // barbero pueda ver las vacaciones de los demás,
                    // simplemente que los días están bloqueados"). El
                    // admin sigue viendo y editando todo, como siempre.
                    const esPropio = esAdmin || col.id === profesionalIdPropio;
                    const puedeEditar = esPropio && b.esTiempoPreciso;
                    return (
                      <div
                        key={b.id}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          if (!puedeEditar) return;
                          setBloqueoEditando({
                            id: b.id,
                            profesionalNombre: col.nombre,
                            horaInicio: horaDeMinutos(b.desdeMin),
                            horaFin: horaDeMinutos(b.hastaMin),
                            motivo: b.motivo,
                          });
                        }}
                        className={
                          "absolute inset-x-0 z-10 flex items-center justify-center overflow-hidden border-y border-stone-400 bg-stone-300/80 px-1 text-center text-[11px] font-medium text-stone-600" +
                          (puedeEditar ? " cursor-pointer hover:bg-stone-300" : "")
                        }
                        style={{
                          top,
                          height: alto,
                          backgroundImage:
                            "repeating-linear-gradient(135deg, rgba(87,83,78,0.18) 0, rgba(87,83,78,0.18) 6px, transparent 6px, transparent 12px)",
                        }}
                        title={
                          !esPropio
                            ? "Bloqueado"
                            : puedeEditar
                              ? `${b.motivo ? `Bloqueado: ${b.motivo}` : "Bloqueado"} — toca para editar las horas`
                              : b.motivo
                                ? `Bloqueado: ${b.motivo}`
                                : "Bloqueado"
                        }
                      >
                        Bloqueado{esPropio && b.motivo ? ` · ${b.motivo}` : ""}
                      </div>
                    );
                  })}

                  {creacion && creacion.profesionalId === col.id && (
                    <div
                      className="absolute inset-x-0.5 z-30 flex items-center justify-center rounded-sm border-2 border-dashed border-blue-500 bg-blue-400/20 text-[11px] font-medium text-blue-700"
                      style={{
                        top:
                          (creacion.inicioMin - minInicioVisual) *
                          PX_POR_MINUTO,
                        height:
                          (creacion.finMin - creacion.inicioMin) *
                          PX_POR_MINUTO,
                      }}
                    >
                      {horaDeMinutos(creacion.inicioMin)}–
                      {horaDeMinutos(creacion.finMin)}
                    </div>
                  )}

                  {(citasPorColumna.get(col.id) ?? []).map((cita) => {
                    const enArrastreCita = arrastrandoCita?.citaId === cita.id;
                    const desde = enArrastreCita
                      ? arrastrandoCita!.inicioMin
                      : minutosEnMadrid(cita.inicio);
                    const hasta = enArrastreCita
                      ? arrastrandoCita!.inicioMin +
                        arrastrandoCita!.duracionMin
                      : minutosEnMadrid(cita.fin);
                    const top = (desde - minInicioVisual) * PX_POR_MINUTO;
                    const alto = Math.max(
                      ALTURA_MINIMA_BLOQUE,
                      (hasta - desde) * PX_POR_MINUTO,
                    );
                    const sePuedeArrastrar =
                      esAdmin &&
                      cita.estado === "confirmada" &&
                      Boolean(cita.profesional?.id);
                    return (
                      <button
                        key={cita.id}
                        onPointerDown={(e) => {
                          // Igual que en el descanso de arriba: siempre se para aquí para
                          // que un pointerdown sobre una cita nunca dispare por error una
                          // creación nueva en la columna, aunque no se pueda arrastrar
                          // esta cita en concreto (barbero, o cita no confirmada).
                          e.stopPropagation();
                          iniciarArrastreCita(e, cita, minInicio, maxFin);
                        }}
                        onClick={() => {
                          if (ultimoArrastreCitaRef.current) return; // fue un arrastre, no un click
                          setSeleccionada(cita);
                        }}
                        disabled={moviendoCitaId === cita.id}
                        className={
                          "absolute inset-x-1 touch-none overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-20 hover:shadow-md disabled:opacity-60 " +
                          claseBloque(cita.estado) +
                          (sePuedeArrastrar
                            ? " cursor-grab active:cursor-grabbing"
                            : "") +
                          (enArrastreCita ? " z-30 shadow-lg" : "")
                        }
                        style={{
                          top,
                          height: alto,
                          ...(cita.estado !== "cancelada"
                            ? estiloColorServicio(cita.servicio?.color)
                            : {}),
                        }}
                        title={
                          sePuedeArrastrar
                            ? "Arrástrala para cambiarla de hora"
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-1">
                          {cita.profesional_elegido_por_cliente && (
                            <span
                              className="text-red-500"
                              title="El cliente pidió a este profesional en concreto"
                            >
                              ♥
                            </span>
                          )}
                          {cita.estado === "completada" && (
                            <span
                              className="text-emerald-600"
                              title="Completada"
                            >
                              ✓
                            </span>
                          )}
                          {cita.estado === "completada" && cita.metodo_pago && (
                            <span className="text-emerald-600" title="Pagada">
                              $
                            </span>
                          )}
                          {cita.estado === "no_presentada" && (
                            <span
                              className="text-amber-600"
                              title="No presentada"
                            >
                              !
                            </span>
                          )}
                          <div className="truncate font-medium">
                            {formatoHora(cita.inicio)} ·{" "}
                            {cita.cliente?.nombre ?? "Cliente"}
                          </div>
                        </div>
                        {alto >= 34 && (
                          <div className="truncate text-stone-500">
                            {cita.servicio?.nombre}
                            {nombresExtras(cita).length > 0
                              ? ` + ${nombresExtras(cita).join(", ")}`
                              : ""}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {seleccionada && (
        <DetalleCitaPanel
          cita={seleccionada}
          avisando={avisando}
          onCerrar={() => setSeleccionada(null)}
          onFinalizar={() => {
            onFinalizar(seleccionada);
            setSeleccionada(null);
          }}
          onCambiarEstado={(estado) => {
            onCambiarEstado(seleccionada.id, estado);
            setSeleccionada(null);
          }}
          onAvisarDisponible={() => onAvisarDisponible(seleccionada.id)}
        />
      )}

      {creacion && creacion.fase !== "arrastrando" && (
        <MenuCreacion
          sedeId={sedeId}
          fecha={fecha}
          profesionalId={creacion.profesionalId}
          profesionales={columnas.filter((c) => c.id !== ID_SIN_ASIGNAR)}
          inicioMin={creacion.inicioMin}
          finMin={creacion.finMin}
          fase={creacion.fase}
          servicios={servicios}
          onCambiarFase={(fase) =>
            setCreacion((actual) => (actual ? { ...actual, fase } : actual))
          }
          onCerrar={() => setCreacion(null)}
          onCreado={() => {
            setCreacion(null);
            onCreado();
          }}
        />
      )}

      {bloqueoEditando && (
        <EditarBloqueoModal
          bloqueo={bloqueoEditando}
          onCerrar={() => setBloqueoEditando(null)}
          onGuardado={() => {
            setBloqueoEditando(null);
            onCreado();
          }}
        />
      )}
    </div>
  );
}

// Menú que aparece al soltar el arrastre de creación (ver iniciarCreacion
// más arriba): primero ofrece elegir entre "Bloqueo de agenda" y "Nueva
// cita", y según lo que se elija muestra un formulario mínimo para esa
// franja — ya con barbero y hora de inicio precargados del propio
// arrastre (aunque se pueden corregir a mano, ver más abajo), así que no
// hay que volver a elegirlos desde cero.
function MenuCreacion({
  sedeId,
  fecha,
  profesionalId,
  profesionales,
  inicioMin,
  finMin,
  fase,
  servicios,
  onCambiarFase,
  onCerrar,
  onCreado,
}: {
  sedeId: string;
  fecha: string;
  profesionalId: string;
  profesionales: { id: string; nombre: string; foto_url?: string | null }[];
  inicioMin: number;
  finMin: number;
  fase: "menu" | "bloqueo" | "cita";
  servicios: ServicioOpcion[];
  onCambiarFase: (fase: "menu" | "bloqueo" | "cita") => void;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const profesionalNombre = profesionales.find((p) => p.id === profesionalId)?.nombre ?? "";
  const [duracionMin, setDuracionMin] = useState(
    Math.max(5, finMin - inicioMin),
  );
  const [motivo, setMotivo] = useState("");
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [profesionalIdElegido, setProfesionalIdElegido] = useState(profesionalId);
  // Hora de inicio y fin de la cita, editables a mano (pedido de Diego,
  // 25/09/2026: como en Booksy, sin atarse a la cuadrícula de huecos de
  // 30 minutos que sí rige para el cliente reservando por la web/
  // WhatsApp) — se validan en el servidor contra el turno, el descanso,
  // los bloqueos/vacaciones y las demás citas de ese barbero (ver
  // saltarValidacionSlot en lib/booking.ts).
  const [horaInicio, setHoraInicio] = useState(horaDeMinutos(inicioMin));
  const [horaFin, setHoraFin] = useState(horaDeMinutos(finMin));
  const [finTocadoAMano, setFinTocadoAMano] = useState(false);
  const [solicitadoPorCliente, setSolicitadoPorCliente] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [estadoCliente, setEstadoCliente] = useState<EstadoClienteRapido>({ tipo: "vacio" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mientras el barbero no haya tocado la hora de fin a mano, se
  // recalcula sola a partir de la hora de inicio y la duración del
  // servicio elegido — un punto de partida razonable que se puede seguir
  // ajustando libremente después.
  useEffect(() => {
    if (finTocadoAMano) return;
    const duracion = servicios.find((s) => s.id === servicioId)?.duracion_minutos ?? 30;
    setHoraFin(horaDeMinutos(minutosDeHora(horaInicio) + duracion));
  }, [servicioId, horaInicio, finTocadoAMano, servicios]);

  // Búsqueda del cliente por teléfono (con un pequeño debounce): si ya
  // existe una ficha con ese número, se enseña el nombre para que el
  // barbero lo confirme en persona; si no, se pide el nombre para dar de
  // alta al cliente nuevo (ver buscarOCrearCliente en lib/clientes.ts, que
  // crea la ficha —y la sincroniza con HubSpot— al guardar la cita).
  useEffect(() => {
    const telefonoLimpio = telefono.trim();
    if (telefonoLimpio.length < 6) {
      setEstadoCliente({ tipo: "vacio" });
      return;
    }
    setEstadoCliente({ tipo: "buscando" });
    const idTimeout = setTimeout(() => {
      fetch(`/api/admin/citas/buscar-cliente?telefono=${encodeURIComponent(telefonoLimpio)}`)
        .then((r) => r.json())
        .then((j) => {
          setEstadoCliente(j.nombre ? { tipo: "encontrado", nombre: j.nombre } : { tipo: "nuevo" });
        })
        .catch(() => setEstadoCliente({ tipo: "vacio" }));
    }, 400);
    return () => clearTimeout(idTimeout);
  }, [telefono]);

  const nombreParaGuardar = estadoCliente.tipo === "encontrado" ? estadoCliente.nombre : nombreNuevo.trim();
  const horaFinValida = minutosDeHora(horaFin) > minutosDeHora(horaInicio);

  async function guardarBloqueo() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bloqueos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sedeId,
          profesionalId,
          fecha,
          horaInicio: horaDeMinutos(inicioMin),
          horaFin: horaDeMinutos(inicioMin + duracionMin),
          motivo: motivo || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo crear el bloqueo.");
        return;
      }
      onCreado();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  async function guardarCita() {
    if (!servicioId || !telefono || !nombreParaGuardar || !horaFinValida) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sedeId,
          servicioId,
          profesionalId: profesionalIdElegido,
          fecha,
          horaInicioISO: isoDesdeMadrid(fecha, horaInicio),
          horaFinISO: isoDesdeMadrid(fecha, horaFin),
          saltarValidacionSlot: true,
          cliente: { nombre: nombreParaGuardar, telefono },
          aceptaComercial: false,
          profesionalElegidoPorCliente: solicitadoPorCliente,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo crear la cita.");
        return;
      }
      onCreado();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <div className="text-lg font-bold text-stone-900">
            {fase === "cita" ? "Nueva cita" : `${horaDeMinutos(inicioMin)} – ${horaDeMinutos(finMin)}`}
          </div>
          <div className="text-sm text-stone-500">{profesionalNombre}</div>
        </div>

        {fase === "menu" && (
          <div className="space-y-2">
            <button
              onClick={() => onCambiarFase("bloqueo")}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-left text-sm font-medium text-stone-800 hover:border-stone-400"
            >
              Bloqueo de agenda
            </button>
            <button
              onClick={() => onCambiarFase("cita")}
              className="w-full rounded-lg bg-brand-yellow px-3 py-2 text-left text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark"
            >
              Nueva cita
            </button>
          </div>
        )}

        {fase === "bloqueo" && (
          <div className="space-y-3">
            <label className="block text-sm text-stone-600">
              Duración (minutos)
              <input
                type="number"
                min={5}
                step={5}
                value={duracionMin}
                onChange={(e) =>
                  setDuracionMin(
                    Math.max(
                      5,
                      Math.round((Number(e.target.value) || 5) / 5) * 5,
                    ),
                  )
                }
                className="mt-1 w-full rounded-lg border border-stone-300 p-2 text-sm"
              />
            </label>
            <input
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-lg border border-stone-300 p-2 text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                disabled={enviando}
                onClick={guardarBloqueo}
                className="flex-1 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {enviando ? "Guardando…" : "Bloquear"}
              </button>
              <button
                onClick={onCerrar}
                className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {fase === "cita" && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Cliente</label>
              <input
                placeholder="Teléfono del cliente"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-sm"
              />
              {estadoCliente.tipo === "buscando" && <p className="mt-1 text-xs text-stone-400">Buscando…</p>}
              {estadoCliente.tipo === "encontrado" && (
                <p className="mt-1 text-sm text-emerald-700">
                  Cliente encontrado: <strong>{estadoCliente.nombre}</strong> — confírmalo con él/ella antes de guardar.
                </p>
              )}
              {estadoCliente.tipo === "nuevo" && (
                <div className="mt-1">
                  <p className="mb-1 text-xs text-amber-700">No hay ningún cliente con este teléfono — se creará uno nuevo.</p>
                  <input
                    placeholder="Nombre del cliente nuevo"
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 p-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Servicio</label>
              <select
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-sm"
              >
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-400">
                Inicio
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 p-2 text-sm normal-case tracking-normal text-stone-900"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-400">
                Final
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => {
                    setFinTocadoAMano(true);
                    setHoraFin(e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-stone-300 p-2 text-sm normal-case tracking-normal text-stone-900"
                />
              </label>
            </div>
            {!horaFinValida && <p className="text-xs text-red-600">La hora de fin debe ser posterior a la de inicio.</p>}

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">Empleado</label>
              <select
                value={profesionalIdElegido}
                onChange={(e) => setProfesionalIdElegido(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2 text-sm"
              >
                {profesionales.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={solicitadoPorCliente}
                onChange={(e) => setSolicitadoPorCliente(e.target.checked)}
              />
              <span className="text-red-500">♥</span>
              Solicitado por el cliente
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                disabled={!servicioId || !telefono || !nombreParaGuardar || !horaFinValida || enviando}
                onClick={guardarCita}
                className="flex-1 rounded-lg bg-brand-yellow px-3 py-2 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
              >
                {enviando ? "Guardando…" : "Guardar cita"}
              </button>
              <button
                onClick={onCerrar}
                className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {fase === "menu" && (
          <button
            onClick={onCerrar}
            className="mt-3 w-full rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// Al tocar un bloqueo de franja horaria ya creado (ver MenuCreacion /
// iniciarCreacion más arriba) se abre esto para corregir sus horas
// exactas — el rectángulo arrastrado es solo un punto de partida, no
// tienen por qué quedarse en los 30 minutos por defecto. Los bloqueos de
// día completo (vacaciones/festivo) no pasan por aquí — esos se llevan
// desde la pantalla de Bloqueos, por día entero.
function EditarBloqueoModal({
  bloqueo,
  onCerrar,
  onGuardado,
}: {
  bloqueo: {
    id: string;
    profesionalNombre: string;
    horaInicio: string;
    horaFin: string;
    motivo: string | null;
  };
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [horaInicio, setHoraInicio] = useState(bloqueo.horaInicio);
  const [horaFin, setHoraFin] = useState(bloqueo.horaFin);
  const [motivo, setMotivo] = useState(bloqueo.motivo ?? "");
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (horaFin <= horaInicio) {
      setError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bloqueos/${bloqueo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horaInicio, horaFin, motivo: motivo || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo guardar el bloqueo.");
        return;
      }
      onGuardado();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    setEliminando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bloqueos/${bloqueo.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("No se pudo eliminar el bloqueo.");
        return;
      }
      onGuardado();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <div className="text-lg font-bold text-stone-900">Editar bloqueo</div>
          <div className="text-sm text-stone-500">{bloqueo.profesionalNombre}</div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-stone-600">
              Desde
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 p-2 text-sm"
              />
            </label>
            <label className="block text-sm text-stone-600">
              Hasta
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 p-2 text-sm"
              />
            </label>
          </div>
          <input
            placeholder="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-lg border border-stone-300 p-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              disabled={guardando || eliminando}
              onClick={guardar}
              className="flex-1 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              disabled={guardando || eliminando}
              onClick={eliminar}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {eliminando ? "Eliminando…" : "Eliminar"}
            </button>
            <button
              onClick={onCerrar}
              className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetalleCitaPanel({
  cita,
  avisando,
  onCerrar,
  onFinalizar,
  onCambiarEstado,
  onAvisarDisponible,
}: {
  cita: Cita;
  avisando: string | null;
  onCerrar: () => void;
  onFinalizar: () => void;
  onCambiarEstado: (estado: string) => void;
  onAvisarDisponible: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-stone-900">
              {formatoHora(cita.inicio)} – {formatoHora(cita.fin)}
            </div>
            <div className="text-sm text-stone-500">
              {cita.cliente?.nombre ?? "Cliente"}
            </div>
          </div>
          <span
            className={
              "shrink-0 rounded-full px-2 py-1 text-xs " +
              (cita.estado === "cancelada"
                ? "bg-red-100 text-red-700"
                : cita.estado === "completada"
                  ? "bg-green-100 text-green-700"
                  : cita.estado === "no_presentada"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-stone-100 text-stone-700")
            }
          >
            {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
          </span>
        </div>

        <div className="space-y-1 text-sm text-stone-700">
          <div>
            <span className="text-stone-400">Servicio: </span>
            {cita.servicio?.nombre ?? "—"}
            {nombresExtras(cita).length > 0 && (
              <span className="text-stone-500"> + {nombresExtras(cita).join(", ")}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-stone-400">Barbero: </span>
            {cita.profesional && (
              <AvatarProfesional
                fotoUrl={cita.profesional.foto_url}
                nombre={cita.profesional.nombre}
                className="h-5 w-5"
              />
            )}
            {cita.profesional?.nombre ?? "Sin asignar"}
            {cita.profesional_elegido_por_cliente && (
              <span
                className="ml-1 text-red-500"
                title="El cliente pidió a este profesional en concreto"
              >
                ♥
              </span>
            )}
            {cita.estado === "completada" && cita.metodo_pago && (
              <span className="ml-1 text-emerald-600" title="Pagada">
                $
              </span>
            )}
          </div>
          {cita.cliente?.telefono && (
            <div>
              <span className="text-stone-400">Teléfono: </span>
              {cita.cliente.telefono}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(cita.estado === "confirmada" || cita.estado === "completada") && (
            <button
              onClick={onAvisarDisponible}
              disabled={avisando === cita.id}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <IconBell className="h-4 w-4" />
              {avisando === cita.id ? "Avisando…" : "Avisar disponible"}
            </button>
          )}
          {cita.estado === "confirmada" && (
            <>
              <button
                onClick={onFinalizar}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                <IconCheck className="h-4 w-4" />
                Completada
              </button>
              <button
                onClick={() => onCambiarEstado("no_presentada")}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600"
              >
                <IconAlertCircle className="h-4 w-4" />
                No presentada
              </button>
              <button
                onClick={() => onCambiarEstado("cancelada")}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
              >
                <IconX className="h-4 w-4" />
                Cancelar
              </button>
            </>
          )}
        </div>

        <button
          onClick={onCerrar}
          className="mt-4 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-200"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

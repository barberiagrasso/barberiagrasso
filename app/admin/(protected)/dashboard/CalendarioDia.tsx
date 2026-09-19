"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fechaEnMadrid, minutosEnMadrid, minutosDeHora, isoDesdeMadrid } from "@/lib/horarioLocal";
import { columnasVisibles, rangoHorario, resolverDescansosDia, ID_SIN_ASIGNAR } from "@/lib/calendarioDia";
import { IconBell, IconCheck, IconAlertCircle, IconX } from "@/components/ui/Icons";

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
  profesional: { id: string; nombre: string } | null;
}
interface Profesional {
  id: string;
  nombre: string;
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
function estiloColorServicio(color: string | null | undefined): React.CSSProperties {
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
  esAdmin,
  cargando,
  onFinalizar,
  onCambiarEstado,
  onAvisarDisponible,
  onDescansoMovido,
  onMoverCita,
  avisando,
}: {
  sedeId: string;
  fecha: string;
  citas: Cita[];
  profesionales: Profesional[];
  horarios: Horario[];
  descansosExcepciones: DescansoExcepcion[];
  esAdmin: boolean;
  cargando: boolean;
  onFinalizar: (cita: Cita) => void;
  onCambiarEstado: (id: string, estado: string) => void;
  onAvisarDisponible: (id: string) => void;
  onDescansoMovido: () => void;
  onMoverCita: (id: string, nuevoInicioISO: string) => Promise<void> | void;
  avisando: string | null;
}) {
  const [seleccionada, setSeleccionada] = useState<Cita | null>(null);

  // Columnas a mostrar: los profesionales que trabajan ese día (tienen
  // horario) o que ya tienen alguna cita ese día, aunque no les tocara
  // turno (una cita puesta a mano, o un profesional que cubre a otro).
  // Si hay alguna cita sin profesional asignado ("cualquiera" al
  // reservar), se añade una columna aparte para no perderla de vista.
  const columnas = useMemo(
    () => columnasVisibles(profesionales, horarios, citas),
    [profesionales, horarios, citas]
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

  // Arrastre del bloque de descanso (solo admin): mientras se arrastra se
  // guarda aquí una vista previa en minutos; al soltar se persiste como
  // excepción de ESE día concreto (no cambia la regla general) y se
  // recarga la agenda.
  const [arrastrando, setArrastrando] = useState<{ profesionalId: string; inicioMin: number; duracionMin: number } | null>(null);
  const [guardandoDescanso, setGuardandoDescanso] = useState(false);

  function iniciarArrastreDescanso(
    e: React.MouseEvent,
    profesionalId: string,
    inicioMin: number,
    finMin: number,
    limiteInicio: number,
    limiteFin: number
  ) {
    if (!esAdmin || guardandoDescanso) return;
    e.preventDefault();
    e.stopPropagation();
    const duracionMin = finMin - inicioMin;
    const yInicial = e.clientY;

    function alMover(ev: MouseEvent) {
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicio = Math.min(Math.max(inicioMin + snapMin, limiteInicio), limiteFin - duracionMin);
      setArrastrando({ profesionalId, inicioMin: nuevoInicio, duracionMin });
    }
    async function alSoltar(ev: MouseEvent) {
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicio = Math.min(Math.max(inicioMin + snapMin, limiteInicio), limiteFin - duracionMin);
      setArrastrando(null);
      if (nuevoInicio === inicioMin) return; // no se movió, nada que guardar
      setGuardandoDescanso(true);
      try {
        await fetch(`/api/admin/profesionales/${profesionalId}/descanso-excepcion`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sedeId,
            fecha,
            horaInicio: horaDeMinutos(nuevoInicio),
            horaFin: horaDeMinutos(nuevoInicio + duracionMin),
          }),
        });
        onDescansoMovido();
      } finally {
        setGuardandoDescanso(false);
      }
    }

    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);
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
  const [arrastrandoCita, setArrastrandoCita] = useState<{ citaId: string; profesionalId: string; inicioMin: number; duracionMin: number } | null>(null);
  const [moviendoCitaId, setMoviendoCitaId] = useState<string | null>(null);
  const ultimoArrastreCitaRef = useRef(false);
  const UMBRAL_ARRASTRE_PX = 4;

  function iniciarArrastreCita(e: React.MouseEvent, cita: Cita, limiteInicio: number, limiteFin: number) {
    if (!esAdmin || cita.estado !== "confirmada" || moviendoCitaId) return;
    if (!cita.profesional?.id) return; // "Sin asignar": no tiene sentido arrastrarla dentro de esa columna
    const profesionalId: string = cita.profesional.id; // ya con tipo no-opcional, para que las funciones anidadas de más abajo no lo vuelvan a ver como "string | undefined"
    e.preventDefault();
    e.stopPropagation();
    ultimoArrastreCitaRef.current = false;
    const inicioMinOriginal = minutosEnMadrid(cita.inicio);
    const duracionMin = minutosEnMadrid(cita.fin) - inicioMinOriginal;
    const yInicial = e.clientY;

    function alMover(ev: MouseEvent) {
      if (Math.abs(ev.clientY - yInicial) > UMBRAL_ARRASTRE_PX) ultimoArrastreCitaRef.current = true;
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicio = Math.min(Math.max(inicioMinOriginal + snapMin, limiteInicio), limiteFin - duracionMin);
      setArrastrandoCita({ citaId: cita.id, profesionalId, inicioMin: nuevoInicio, duracionMin });
    }
    async function alSoltar(ev: MouseEvent) {
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
      setArrastrandoCita(null);
      if (!ultimoArrastreCitaRef.current) return; // fue un click, no un arrastre
      const deltaMin = (ev.clientY - yInicial) / PX_POR_MINUTO;
      const snapMin = Math.round(deltaMin / 15) * 15;
      const nuevoInicioMin = Math.min(Math.max(inicioMinOriginal + snapMin, limiteInicio), limiteFin - duracionMin);
      if (nuevoInicioMin === inicioMinOriginal) return; // soltada en el mismo sitio
      setMoviendoCitaId(cita.id);
      try {
        await onMoverCita(cita.id, isoDesdeMadrid(fecha, horaDeMinutos(nuevoInicioMin)));
      } finally {
        setMoviendoCitaId(null);
      }
    }

    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);
  }

  // Rango de horas a mostrar: el de los turnos de ese día si hay alguno,
  // si no el de las citas ya puestas, y si tampoco hay nada, un horario
  // razonable por defecto — para que un día vacío no se quede sin eje.
  const { minInicio, maxFin } = useMemo(() => {
    const citasConMinutos = citas.map((c) => ({ desdeMin: minutosEnMadrid(c.inicio), hastaMin: minutosEnMadrid(c.fin) }));
    return rangoHorario(
      columnas.map((c) => c.id),
      horarios,
      citasConMinutos
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
  const posicionAhora = Math.min(Math.max(ahoraMin, minInicioVisual), maxFinVisual);

  if (cargando && citas.length === 0) {
    return <p className="text-sm text-stone-500">Cargando…</p>;
  }
  if (columnas.length === 0) {
    return <p className="text-sm text-stone-500">No hay ningún barbero de turno ese día en esta sede.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 64 + columnas.length * 160 }}>
          {/* --- Cabecera: nombre de cada barbero --- */}
          <div className="sticky top-0 z-20 flex border-b border-stone-200 bg-white">
            <div className="w-16 shrink-0" />
            {columnas.map((col) => (
              <div key={col.id} className="flex-1 border-l border-stone-100 p-2 text-center text-sm font-medium text-stone-900">
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
                    {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
                  </div>
                ))}
              </div>

              {columnas.map((col) => (
                <div key={col.id} className="relative flex-1 border-l border-stone-100">
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
                      className={"absolute inset-x-0 border-t " + (m % 60 === 0 ? "border-stone-200" : "border-stone-100")}
                      style={{ top: (m - minInicioVisual) * PX_POR_MINUTO }}
                    />
                  ))}

                  {esHoy && (
                    <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (posicionAhora - minInicioVisual) * PX_POR_MINUTO }}>
                      <div className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-red-500" />
                    </div>
                  )}

                  {(() => {
                    const descanso = descansoPorColumna.get(col.id);
                    if (!descanso) return null;
                    const enArrastre = arrastrando?.profesionalId === col.id;
                    const desde = enArrastre ? arrastrando!.inicioMin : minutosDeHora(descanso.hora_inicio);
                    const hasta = enArrastre ? arrastrando!.inicioMin + arrastrando!.duracionMin : minutosDeHora(descanso.hora_fin);
                    const top = (desde - minInicioVisual) * PX_POR_MINUTO;
                    const alto = (hasta - desde) * PX_POR_MINUTO;
                    return (
                      <div
                        key="descanso"
                        onMouseDown={(e) => iniciarArrastreDescanso(e, col.id, minutosDeHora(descanso.hora_inicio), minutosDeHora(descanso.hora_fin), minInicio, maxFin)}
                        className={
                          "absolute inset-x-0 z-10 flex items-center justify-center border-y border-stone-700 bg-stone-800/90 text-[11px] font-medium text-white " +
                          (esAdmin ? "cursor-grab select-none active:cursor-grabbing" : "")
                        }
                        style={{ top, height: alto }}
                        title={esAdmin ? "Descanso — arrástralo para moverlo solo este día" : "Descanso"}
                      >
                        Descanso {horaDeMinutos(desde)}–{horaDeMinutos(hasta)}
                        {descanso.esExcepcion && " *"}
                      </div>
                    );
                  })()}

                  {(citasPorColumna.get(col.id) ?? []).map((cita) => {
                    const enArrastreCita = arrastrandoCita?.citaId === cita.id;
                    const desde = enArrastreCita ? arrastrandoCita!.inicioMin : minutosEnMadrid(cita.inicio);
                    const hasta = enArrastreCita
                      ? arrastrandoCita!.inicioMin + arrastrandoCita!.duracionMin
                      : minutosEnMadrid(cita.fin);
                    const top = (desde - minInicioVisual) * PX_POR_MINUTO;
                    const alto = Math.max(ALTURA_MINIMA_BLOQUE, (hasta - desde) * PX_POR_MINUTO);
                    const sePuedeArrastrar = esAdmin && cita.estado === "confirmada" && Boolean(cita.profesional?.id);
                    return (
                      <button
                        key={cita.id}
                        onMouseDown={(e) => iniciarArrastreCita(e, cita, minInicio, maxFin)}
                        onClick={() => {
                          if (ultimoArrastreCitaRef.current) return; // fue un arrastre, no un click
                          setSeleccionada(cita);
                        }}
                        disabled={moviendoCitaId === cita.id}
                        className={
                          "absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-20 hover:shadow-md disabled:opacity-60 " +
                          claseBloque(cita.estado) +
                          (sePuedeArrastrar ? " cursor-grab active:cursor-grabbing" : "") +
                          (enArrastreCita ? " z-30 shadow-lg" : "")
                        }
                        style={{ top, height: alto, ...(cita.estado !== "cancelada" ? estiloColorServicio(cita.servicio?.color) : {}) }}
                        title={sePuedeArrastrar ? "Arrástrala para cambiarla de hora" : undefined}
                      >
                        <div className="flex items-center gap-1">
                          {cita.profesional_elegido_por_cliente && (
                            <span className="text-red-500" title="El cliente pidió a este profesional en concreto">♥</span>
                          )}
                          {cita.estado === "completada" && <span className="text-emerald-600" title="Completada">✓</span>}
                          {cita.estado === "completada" && cita.metodo_pago && (
                            <span className="text-emerald-600" title="Pagada">$</span>
                          )}
                          {cita.estado === "no_presentada" && <span className="text-amber-600" title="No presentada">!</span>}
                          <div className="truncate font-medium">
                            {formatoHora(cita.inicio)} · {cita.cliente?.nombre ?? "Cliente"}
                          </div>
                        </div>
                        {alto >= 34 && <div className="truncate text-stone-500">{cita.servicio?.nombre}</div>}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-stone-900">
              {formatoHora(cita.inicio)} – {formatoHora(cita.fin)}
            </div>
            <div className="text-sm text-stone-500">{cita.cliente?.nombre ?? "Cliente"}</div>
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
          </div>
          <div>
            <span className="text-stone-400">Barbero: </span>
            {cita.profesional?.nombre ?? "Sin asignar"}
            {cita.profesional_elegido_por_cliente && (
              <span className="ml-1 text-red-500" title="El cliente pidió a este profesional en concreto">
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

        <button onClick={onCerrar} className="mt-4 rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-200">
          Cerrar
        </button>
      </div>
    </div>
  );
}

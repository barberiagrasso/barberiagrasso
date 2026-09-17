"use client";

import { useEffect, useMemo, useState } from "react";
import { fechaEnMadrid, minutosEnMadrid } from "@/lib/horarioLocal";
import { columnasVisibles, rangoHorario, ID_SIN_ASIGNAR } from "@/lib/calendarioDia";

interface Cita {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  origen: string;
  cliente: { id: string; nombre: string; telefono: string } | null;
  servicio: { id: string; nombre: string } | null;
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

function formatoHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

function claseBloque(estado: string) {
  switch (estado) {
    case "completada":
      return "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "no_presentada":
      return "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100";
    case "cancelada":
      return "border-red-200 bg-red-50 text-red-400 line-through opacity-70 hover:opacity-100";
    default:
      return "border-brand-yellow/50 bg-brand-yellow/15 text-stone-900 hover:bg-brand-yellow/25";
  }
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
  fecha,
  citas,
  profesionales,
  horarios,
  cargando,
  onFinalizar,
  onCambiarEstado,
  onAvisarDisponible,
  avisando,
}: {
  fecha: string;
  citas: Cita[];
  profesionales: Profesional[];
  horarios: Horario[];
  cargando: boolean;
  onFinalizar: (cita: Cita) => void;
  onCambiarEstado: (id: string, estado: string) => void;
  onAvisarDisponible: (id: string) => void;
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

  const alturaTotal = (maxFin - minInicio) * PX_POR_MINUTO;

  const marcas = useMemo(() => {
    const lista: number[] = [];
    for (let m = minInicio; m <= maxFin; m += 30) lista.push(m);
    return lista;
  }, [minInicio, maxFin]);

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
  const posicionAhora = Math.min(Math.max(ahoraMin, minInicio), maxFin);

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
                    style={{ top: (m - minInicio) * PX_POR_MINUTO }}
                  >
                    {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
                  </div>
                ))}
              </div>

              {columnas.map((col) => (
                <div key={col.id} className="relative flex-1 border-l border-stone-100">
                  {marcas.map((m) => (
                    <div
                      key={m}
                      className={"absolute inset-x-0 border-t " + (m % 60 === 0 ? "border-stone-200" : "border-stone-100")}
                      style={{ top: (m - minInicio) * PX_POR_MINUTO }}
                    />
                  ))}

                  {esHoy && (
                    <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (posicionAhora - minInicio) * PX_POR_MINUTO }}>
                      <div className="absolute -left-0.5 -top-1 h-2 w-2 rounded-full bg-red-500" />
                    </div>
                  )}

                  {(citasPorColumna.get(col.id) ?? []).map((cita) => {
                    const desde = minutosEnMadrid(cita.inicio);
                    const hasta = minutosEnMadrid(cita.fin);
                    const top = (desde - minInicio) * PX_POR_MINUTO;
                    const alto = Math.max(ALTURA_MINIMA_BLOQUE, (hasta - desde) * PX_POR_MINUTO);
                    return (
                      <button
                        key={cita.id}
                        onClick={() => setSeleccionada(cita)}
                        className={"absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-20 hover:shadow-md " + claseBloque(cita.estado)}
                        style={{ top, height: alto }}
                      >
                        <div className="truncate font-medium">
                          {formatoHora(cita.inicio)} · {cita.cliente?.nombre ?? "Cliente"}
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
          </div>
          {cita.cliente?.telefono && (
            <div>
              <span className="text-stone-400">Teléfono: </span>
              {cita.cliente.telefono}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {(cita.estado === "confirmada" || cita.estado === "completada") && (
            <button
              onClick={onAvisarDisponible}
              disabled={avisando === cita.id}
              className="text-sm text-blue-700 underline disabled:opacity-50"
            >
              {avisando === cita.id ? "Avisando…" : "Avisar disponible"}
            </button>
          )}
          {cita.estado === "confirmada" && (
            <>
              <button onClick={onFinalizar} className="text-sm text-green-700 underline">
                Completada
              </button>
              <button onClick={() => onCambiarEstado("no_presentada")} className="text-sm text-amber-700 underline">
                No presentada
              </button>
              <button onClick={() => onCambiarEstado("cancelada")} className="text-sm text-red-700 underline">
                Cancelar
              </button>
            </>
          )}
        </div>

        <button onClick={onCerrar} className="mt-4 text-sm text-stone-500 underline">
          Cerrar
        </button>
      </div>
    </div>
  );
}

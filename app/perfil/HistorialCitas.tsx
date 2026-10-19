"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";
import { ReciboView } from "@/components/recibo/ReciboView";
import type { DatosRecibo } from "@/lib/recibo";

export interface CitaNormalizada {
  id: string;
  inicio: string;
  estado: string;
  // Necesarios para poder buscar huecos libres al "Cambiar hora" (ver
  // CambiarHora más abajo, pedido de Diego 03/10/2026) sin tener que
  // volver a consultar el servidor solo para saber qué servicio/sede era.
  sedeId: string;
  servicioId: string;
  // Solo si el cliente había pedido expresamente este profesional (no
  // "Cualquiera") — si no, se manda null para que la búsqueda de huecos al
  // cambiar la hora no se quede atada al barbero que le tocó la vez
  // anterior sin que lo pidiera.
  profesionalId: string | null;
  duracionExtraMinutos: number;
  sedeNombre: string | null;
  servicioNombre: string;
  precioTotalCentimos: number;
  profesionalNombre: string;
  profesionalFotoUrl?: string | null;
  extrasNombres: string[];
  // Solo presente en una cita "completada" (ver lib/recibo.ts) — permite
  // enseñar "Ver recibo" sin tener que pedirlo aparte al servidor, ya
  // viene calculado desde app/perfil/page.tsx.
  recibo: DatosRecibo | null;
}

interface FranjaSimple {
  hora_inicio: string;
  profesional_id: string;
  profesional_nombre: string;
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_presentada: "No presentada",
};

function colorEstado(estado: string, activa: boolean): string {
  if (!activa) {
    switch (estado) {
      case "completada":
        return "text-emerald-400";
      case "cancelada":
      case "no_presentada":
        return "text-red-400";
      default:
        return "text-brand-white-dim";
    }
  }
  // Cita activa: fondo blanco (ver estilo de la tarjeta más abajo), así
  // que la etiqueta de estado necesita un contraste oscuro, no los
  // colores pensados para fondo negro.
  return "text-brand-yellow-dark";
}

// Próximos N días en Europe/Madrid, como "YYYY-MM-DD" — el mismo formato
// que espera /api/disponibilidad. No hace falta nada más fino: solo se
// usa para pintar los botones de día del selector de "Cambiar hora".
function generarProximosDias(cantidad: number): string[] {
  const dias: string[] = [];
  for (let i = 0; i < cantidad; i++) {
    const fecha = new Date(Date.now() + i * 86_400_000);
    dias.push(fecha.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }));
  }
  return dias;
}

function etiquetaDia(fechaYMD: string, indice: number): string {
  if (indice === 0) return "Hoy";
  if (indice === 1) return "Mañana";
  const fecha = new Date(`${fechaYMD}T12:00:00`);
  return fecha.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", timeZone: "Europe/Madrid" });
}

// Un hueco por hora (si "cualquiera" hay varios profesionales libres a la
// vez, se enseña una sola opción) — mismo criterio que el resto de la app
// (horasUnicas en BookingFlow.tsx, franjasUnicasPorHora en
// lib/asistenteReserva.ts): aquí no se elige barbero, así que mostrar 3
// veces la misma hora sería confuso.
function franjasUnicasPorHora(franjas: FranjaSimple[]): FranjaSimple[] {
  const mapa = new Map<string, FranjaSimple>();
  for (const f of franjas) {
    if (!mapa.has(f.hora_inicio)) mapa.set(f.hora_inicio, f);
  }
  return Array.from(mapa.values());
}

// Selector de "qué día y qué hora" para cambiar una cita sin cancelarla —
// pedido de Diego (03/10/2026): antes de cancelar definitivamente, el
// cliente debe poder modificarla dentro del horario disponible. A
// propósito simple (lista de días + horas), no el calendario mensual
// completo de "Reservar cita".
function CambiarHora({
  cita,
  oscuro,
  enviando,
  onElegir,
  onVolver,
}: {
  cita: CitaNormalizada;
  oscuro: boolean;
  enviando: boolean;
  onElegir: (horaInicioISO: string, profesionalId: string) => void;
  onVolver: () => void;
}) {
  const dias = useMemo(() => generarProximosDias(10), []);
  const [diaElegido, setDiaElegido] = useState(dias[0]);
  const [slots, setSlots] = useState<FranjaSimple[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const params = new URLSearchParams({
      sedeId: cita.sedeId,
      servicioId: cita.servicioId,
      fecha: diaElegido,
      duracionExtraMinutos: String(cita.duracionExtraMinutos),
    });
    if (cita.profesionalId) params.set("profesionalId", cita.profesionalId);

    fetch(`/api/disponibilidad?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelado) return;
        if (Array.isArray(json.slots)) setSlots(json.slots);
        else setError("No se pudo comprobar la disponibilidad.");
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo conectar con el servidor.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [cita.sedeId, cita.servicioId, cita.profesionalId, cita.duracionExtraMinutos, diaElegido]);

  const horasUnicas = slots ? franjasUnicasPorHora(slots) : [];
  const colorTexto = oscuro ? "text-brand-white-dim" : "text-black/60";

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dias.map((dia, i) => (
          <button
            key={dia}
            onClick={() => setDiaElegido(dia)}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 font-body text-xs font-semibold capitalize transition-colors " +
              (dia === diaElegido
                ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                : oscuro
                  ? "border-brand-line text-brand-white-dim hover:border-brand-yellow/50"
                  : "border-black/15 text-black/60 hover:border-brand-yellow/50")
            }
          >
            {etiquetaDia(dia, i)}
          </button>
        ))}
      </div>

      {cargando && <p className={"font-body text-xs " + colorTexto}>Buscando huecos…</p>}
      {!cargando && error && <p className="font-body text-xs text-red-400">{error}</p>}
      {!cargando && !error && horasUnicas.length === 0 && (
        <p className={"font-body text-xs " + colorTexto}>No queda ningún hueco libre ese día. Prueba con otro.</p>
      )}
      {!cargando && horasUnicas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {horasUnicas.map((slot) => (
            <button
              key={slot.hora_inicio}
              disabled={enviando}
              onClick={() => onElegir(slot.hora_inicio, slot.profesional_id)}
              className={
                "rounded-full border px-3 py-1.5 font-mono text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                (oscuro
                  ? "border-brand-line text-brand-white hover:border-brand-yellow hover:text-brand-yellow"
                  : "border-black/15 text-black hover:border-brand-yellow-dark hover:text-brand-yellow-dark")
              }
            >
              {new Date(slot.hora_inicio).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Madrid",
              })}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onVolver}
        disabled={enviando}
        className={
          "font-body text-xs underline decoration-brand-line underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 " +
          (oscuro ? "text-brand-white-dim hover:text-brand-yellow" : "text-black/60 hover:text-black")
        }
      >
        Volver
      </button>
    </div>
  );
}

export function HistorialCitas({ historialInicial }: { historialInicial: CitaNormalizada[] }) {
  const [historial, setHistorial] = useState(historialInicial);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [reprogramandoId, setReprogramandoId] = useState<string | null>(null);
  const [errorPorId, setErrorPorId] = useState<Record<string, string>>({});
  const [reciboAbierto, setReciboAbierto] = useState<DatosRecibo | null>(null);
  // Se fija una sola vez al montar (no en cada render, que sería una
  // lectura "impura") — de sobra para decidir qué citas son futuras.
  const [ahora] = useState(() => Date.now());

  async function cancelar(id: string) {
    setCancelandoId(id);
    setErrorPorId((actual) => ({ ...actual, [id]: "" }));
    try {
      const res = await fetch(`/api/citas/${id}/cancelar`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorPorId((actual) => ({ ...actual, [id]: json.error || "No se pudo cancelar la cita." }));
        return;
      }
      setHistorial((actual) => actual.map((c) => (c.id === id ? { ...c, estado: "cancelada" } : c)));
      setConfirmandoId(null);
    } catch {
      setErrorPorId((actual) => ({ ...actual, [id]: "No se pudo conectar con el servidor." }));
    } finally {
      setCancelandoId(null);
    }
  }

  async function reprogramar(id: string, horaInicioISO: string, profesionalId: string) {
    setReprogramandoId(id);
    setErrorPorId((actual) => ({ ...actual, [id]: "" }));
    try {
      const res = await fetch(`/api/citas/${id}/reprogramar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horaInicioISO, profesionalId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorPorId((actual) => ({ ...actual, [id]: json.error || "No se pudo cambiar la hora." }));
        return;
      }
      setHistorial((actual) =>
        actual.map((c) =>
          c.id === id ? { ...c, inicio: json.cita.inicio, profesionalNombre: json.profesionalNombre } : c
        )
      );
      setCambiandoId(null);
    } catch {
      setErrorPorId((actual) => ({ ...actual, [id]: "No se pudo conectar con el servidor." }));
    } finally {
      setReprogramandoId(null);
    }
  }

  if (historial.length === 0) {
    return (
      <p className="rounded-xl border border-brand-line bg-brand-black-soft/60 p-4 font-body text-sm text-brand-white-dim">
        Todavía no tienes citas con nosotros.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {historial.map((cita) => {
        // "Activa" (pedido de Diego, 19/09/2026): una cita confirmada que
        // todavía no ha pasado — fondo blanco y texto negro. Cualquier
        // otra (completada, cancelada, no presentada, o una confirmada
        // cuya hora ya pasó) se ve apagada: fondo negro y letra blanca.
        const activa = cita.estado === "confirmada" && new Date(cita.inicio).getTime() > ahora;
        const puedeCancelar = activa;

        return (
          <div
            key={cita.id}
            className={
              "rounded-xl border p-4 transition-colors " +
              (activa ? "border-brand-white bg-brand-white text-brand-black" : "border-brand-line bg-brand-black text-brand-white")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-base">{cita.servicioNombre}</p>
                <p className={"mt-0.5 font-body text-sm " + (activa ? "text-brand-black/70" : "text-brand-white-dim")}>
                  {new Date(cita.inicio).toLocaleString("es-ES", {
                    dateStyle: "full",
                    timeStyle: "short",
                    timeZone: "Europe/Madrid",
                  })}
                </p>
                <p
                  className={
                    "mt-0.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider " +
                    (activa ? "text-brand-black/70" : "text-brand-white-dim")
                  }
                >
                  <AvatarProfesional fotoUrl={cita.profesionalFotoUrl} nombre={cita.profesionalNombre} className="h-4 w-4" />
                  {cita.sedeNombre} · {cita.profesionalNombre}
                </p>
                {cita.extrasNombres.length > 0 && (
                  <p className={"mt-1 font-body text-xs " + (activa ? "text-brand-black/70" : "text-brand-white-dim")}>
                    + {cita.extrasNombres.join(", ")}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className={"font-mono text-xs uppercase tracking-wider " + colorEstado(cita.estado, activa)}>
                  {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
                </p>
                <p className="mt-1 font-mono text-base tabular-nums">{formatearPrecio(cita.precioTotalCentimos)}</p>
                {cita.recibo && (
                  <button
                    onClick={() => setReciboAbierto(cita.recibo)}
                    className={
                      "mt-1 font-body text-xs underline decoration-brand-line underline-offset-4 " +
                      (activa ? "text-brand-black/70 hover:text-brand-black" : "text-brand-white-dim hover:text-brand-yellow")
                    }
                  >
                    Ver recibo
                  </button>
                )}
              </div>
            </div>

            {puedeCancelar && (
              <div className={"mt-3 border-t pt-3 " + (activa ? "border-brand-black/15" : "border-brand-line")}>
                {cambiandoId === cita.id ? (
                  <CambiarHora
                    cita={cita}
                    oscuro={!activa}
                    enviando={reprogramandoId === cita.id}
                    onElegir={(horaInicioISO, profesionalId) => reprogramar(cita.id, horaInicioISO, profesionalId)}
                    onVolver={() => setCambiandoId(null)}
                  />
                ) : confirmandoId === cita.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={"font-body text-sm " + (activa ? "text-brand-black/70" : "text-brand-white-dim")}>
                      ¿Seguro que quieres cancelarla?
                    </span>
                    <button
                      onClick={() => {
                        setConfirmandoId(null);
                        setCambiandoId(cita.id);
                      }}
                      className="rounded-full bg-brand-yellow px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-brand-yellow-ink hover:bg-brand-yellow-dark"
                    >
                      Cambiar hora
                    </button>
                    <button
                      onClick={() => cancelar(cita.id)}
                      disabled={cancelandoId === cita.id}
                      className="rounded-full bg-red-500/90 px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {cancelandoId === cita.id ? "Cancelando…" : "Sí, cancelar"}
                    </button>
                    <button
                      onClick={() => setConfirmandoId(null)}
                      className={
                        "font-body text-xs underline decoration-brand-line underline-offset-4 " +
                        (activa ? "text-brand-black/70 hover:text-brand-black" : "text-brand-white-dim hover:text-brand-yellow")
                      }
                    >
                      No, mantener
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmandoId(cita.id)}
                    className={
                      "font-body text-xs underline decoration-brand-line underline-offset-4 " +
                      (activa ? "text-brand-black/70 hover:text-red-600" : "text-brand-white-dim hover:text-red-400")
                    }
                  >
                    Cancelar cita
                  </button>
                )}
                {errorPorId[cita.id] && (
                  <p className="mt-2 font-body text-xs text-red-400">{errorPorId[cita.id]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {reciboAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-10"
          onClick={() => setReciboAbierto(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-stone-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <ReciboView recibo={reciboAbierto} />
            <button
              onClick={() => setReciboAbierto(null)}
              className="mt-4 w-full rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

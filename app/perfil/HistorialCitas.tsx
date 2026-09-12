"use client";

import { useState } from "react";

export interface CitaNormalizada {
  id: string;
  inicio: string;
  estado: string;
  sedeNombre: string | null;
  servicioNombre: string;
  precioTotalCentimos: number;
  profesionalNombre: string;
  extrasNombres: string[];
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

function colorEstado(estado: string): string {
  switch (estado) {
    case "completada":
      return "text-emerald-400";
    case "cancelada":
    case "no_presentada":
      return "text-red-400";
    default:
      return "text-brand-yellow";
  }
}

export function HistorialCitas({ historialInicial }: { historialInicial: CitaNormalizada[] }) {
  const [historial, setHistorial] = useState(historialInicial);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [errorPorId, setErrorPorId] = useState<Record<string, string>>({});
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
        const puedeCancelar = cita.estado === "confirmada" && new Date(cita.inicio).getTime() > ahora;

        return (
          <div key={cita.id} className="rounded-xl border border-brand-line bg-brand-black-soft/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-base text-brand-white">{cita.servicioNombre}</p>
                <p className="mt-0.5 font-body text-sm text-brand-white-dim">
                  {new Date(cita.inicio).toLocaleString("es-ES", {
                    dateStyle: "full",
                    timeStyle: "short",
                    timeZone: "Europe/Madrid",
                  })}
                </p>
                <p className="mt-0.5 font-mono text-xs uppercase tracking-wider text-brand-white-dim">
                  {cita.sedeNombre} · {cita.profesionalNombre}
                </p>
                {cita.extrasNombres.length > 0 && (
                  <p className="mt-1 font-body text-xs text-brand-white-dim">+ {cita.extrasNombres.join(", ")}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className={"font-mono text-xs uppercase tracking-wider " + colorEstado(cita.estado)}>
                  {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
                </p>
                <p className="mt-1 font-mono text-base tabular-nums text-brand-white">
                  {formatearPrecio(cita.precioTotalCentimos)}
                </p>
              </div>
            </div>

            {puedeCancelar && (
              <div className="mt-3 border-t border-brand-line pt-3">
                {confirmandoId === cita.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-body text-sm text-brand-white-dim">¿Seguro que quieres cancelarla?</span>
                    <button
                      onClick={() => cancelar(cita.id)}
                      disabled={cancelandoId === cita.id}
                      className="rounded-full bg-red-500/90 px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {cancelandoId === cita.id ? "Cancelando…" : "Sí, cancelar"}
                    </button>
                    <button
                      onClick={() => setConfirmandoId(null)}
                      className="font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
                    >
                      No, mantener
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmandoId(cita.id)}
                    className="font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-red-400"
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
    </div>
  );
}

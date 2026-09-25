"use client";

import { useState } from "react";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";
import { ReciboView } from "@/components/recibo/ReciboView";
import type { DatosRecibo } from "@/lib/recibo";

export interface CitaNormalizada {
  id: string;
  inicio: string;
  estado: string;
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

export function HistorialCitas({ historialInicial }: { historialInicial: CitaNormalizada[] }) {
  const [historial, setHistorial] = useState(historialInicial);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
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
                {confirmandoId === cita.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={"font-body text-sm " + (activa ? "text-brand-black/70" : "text-brand-white-dim")}>
                      ¿Seguro que quieres cancelarla?
                    </span>
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

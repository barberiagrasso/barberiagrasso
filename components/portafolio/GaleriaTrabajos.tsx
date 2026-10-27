"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface FotoGaleria {
  id: string;
  url: string;
  descripcion?: string | null;
}

/**
 * Cuadrícula de fotos de trabajos y visor a pantalla completa (pedido de
 * Diego, 27/10/2026, al estilo del portafolio de Booksy). En el visor se
 * pasa de foto deslizando el dedo, con las flechas o con el teclado.
 */
export function GaleriaTrabajos({ fotos }: { fotos: FotoGaleria[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fotos.map((foto, i) => (
          <button
            key={foto.id}
            type="button"
            onClick={() => setAbierta(i)}
            className="overflow-hidden rounded-xl bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow"
            aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto.url}
              alt={foto.descripcion ?? "Trabajo de Barbería Grasso"}
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-105"
            />
          </button>
        ))}
      </div>
      {abierta !== null && (
        <VisorFotos fotos={fotos} inicial={abierta} onCerrar={() => setAbierta(null)} />
      )}
    </>
  );
}

function VisorFotos({ fotos, inicial, onCerrar }: { fotos: FotoGaleria[]; inicial: number; onCerrar: () => void }) {
  const [indice, setIndice] = useState(inicial);
  const inicioToque = useRef<number | null>(null);

  const anterior = useCallback(() => setIndice((i) => (i - 1 + fotos.length) % fotos.length), [fotos.length]);
  const siguiente = useCallback(() => setIndice((i) => (i + 1) % fotos.length), [fotos.length]);

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowLeft") anterior();
      if (e.key === "ArrowRight") siguiente();
    }
    window.addEventListener("keydown", alPulsar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [anterior, siguiente, onCerrar]);

  const foto = fotos[indice];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fotos de trabajos"
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      onTouchStart={(e) => {
        inicioToque.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (inicioToque.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? inicioToque.current) - inicioToque.current;
        inicioToque.current = null;
        if (dx > 50) anterior();
        else if (dx < -50) siguiente();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-mono text-xs tracking-wider text-white/60">
          {indice + 1} / {fotos.length}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="rounded-full px-3 py-1.5 font-body text-sm text-white/80 hover:bg-white/10"
        >
          Cerrar ✕
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6" onClick={onCerrar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={foto.id}
          src={foto.url}
          alt={foto.descripcion ?? "Trabajo de Barbería Grasso"}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {fotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                anterior();
              }}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 sm:flex"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                siguiente();
              }}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 sm:flex"
            >
              ›
            </button>
          </>
        )}
      </div>
      {foto.descripcion && <p className="px-4 pb-6 text-center font-body text-sm text-white/70">{foto.descripcion}</p>}
    </div>
  );
}

/**
 * Hoja con las fotos de UN servicio (botón "Ver trabajos" de la reserva).
 * Las pide al abrirse, así la reserva no carga fotos que nadie ha pedido.
 */
export function HojaTrabajosServicio({
  servicioId,
  servicioNombre,
  onCerrar,
}: {
  servicioId: string;
  servicioNombre: string;
  onCerrar: () => void;
}) {
  const [fotos, setFotos] = useState<FotoGaleria[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    fetch(`/api/portafolio?servicioId=${encodeURIComponent(servicioId)}`, { signal: control.signal })
      .then((r) => r.json())
      .then((j) => setFotos(j.fotos ?? []))
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) setError(true);
      });
    return () => control.abort();
  }, [servicioId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-brand-black p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-brand-white-dim">Nuestros trabajos</p>
            <h2 className="font-heading text-xl text-brand-white">{servicioNombre}</h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full px-3 py-1.5 font-body text-sm text-brand-white-dim hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        {error ? (
          <p className="font-body text-sm text-brand-white-dim">No se pudieron cargar las fotos.</p>
        ) : fotos === null ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : fotos.length === 0 ? (
          <p className="font-body text-sm text-brand-white-dim">Todavía no hay fotos de este servicio.</p>
        ) : (
          <GaleriaTrabajos fotos={fotos} />
        )}
      </div>
    </div>
  );
}

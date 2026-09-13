"use client";

import { useState } from "react";

// Opcional: si el cliente lo rellena, Barbería Grasso le manda un aviso
// de cumpleaños por WhatsApp una vez al año (ver lib/retencion.ts).
export function CumpleanosForm({ fechaInicial }: { fechaInicial: string | null }) {
  const [fecha, setFecha] = useState(fechaInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      const res = await fetch("/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaNacimiento: fecha || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "No se pudo guardar.");
        return;
      }
      setGuardado(true);
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mb-8 rounded-xl border border-brand-line bg-brand-black-soft/60 p-4">
      <h2 className="font-heading text-lg text-brand-white">Tu cumpleaños</h2>
      <p className="mt-1 font-body text-xs text-brand-white-dim">
        Cuéntanoslo y te mandamos una sorpresa por WhatsApp ese día. Es opcional.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setGuardado(false);
          }}
          className="rounded-lg border border-brand-line bg-transparent p-2 font-body text-sm text-brand-white focus:border-brand-yellow focus:outline-none"
        />
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-full bg-brand-yellow px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {guardado && <span className="font-body text-xs text-brand-yellow">Guardado ✓</span>}
      </div>
      {error && <p className="mt-2 font-body text-xs text-red-400">{error}</p>}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

interface ResenaCruda {
  id: string;
  estrellas: number;
  comentario: string | null;
  created_at: string;
  cliente: { nombre: string } | { nombre: string }[] | null;
  profesional: { nombre: string } | { nombre: string }[] | null;
  sede: { nombre: string } | { nombre: string }[] | null;
}

// Supabase devuelve las relaciones "a uno" como objeto normalmente, pero
// TypeScript las tipa como posible array según la versión del cliente.
function uno<T>(valor: T | T[] | null): T | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OpinionesClient({ resenas }: { resenas: ResenaCruda[] }) {
  const sedes = useMemo(
    () => Array.from(new Set(resenas.map((r) => uno(r.sede)?.nombre).filter((n): n is string => Boolean(n)))),
    [resenas],
  );
  const [sedeFiltro, setSedeFiltro] = useState<string | null>(null);

  const filtradas = sedeFiltro ? resenas.filter((r) => uno(r.sede)?.nombre === sedeFiltro) : resenas;
  const media = filtradas.length > 0 ? filtradas.reduce((acc, r) => acc + r.estrellas, 0) / filtradas.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <div>
          <span className="text-lg font-bold text-amber-500">★ {media.toFixed(1)}</span>
          <span className="ml-1 text-sm text-stone-500">({filtradas.length} opinion{filtradas.length === 1 ? "" : "es"})</span>
        </div>
        {sedes.length > 1 && (
          <div className="flex gap-1 rounded-lg border border-stone-300 p-1">
            <button
              onClick={() => setSedeFiltro(null)}
              className={"rounded-md px-3 py-1 text-xs " + (sedeFiltro === null ? "bg-stone-900 text-white" : "text-stone-600")}
            >
              Todas
            </button>
            {sedes.map((s) => (
              <button
                key={s}
                onClick={() => setSedeFiltro(s)}
                className={"rounded-md px-3 py-1 text-xs " + (sedeFiltro === s ? "bg-stone-900 text-white" : "text-stone-600")}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {filtradas.map((r) => (
          <div key={r.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-stone-900">
                <span className="text-amber-500">{"★".repeat(r.estrellas)}</span>
                <span className="text-stone-300">{"★".repeat(5 - r.estrellas)}</span>
                <span className="ml-2 text-stone-500">
                  {uno(r.cliente)?.nombre ?? "Cliente"} · {uno(r.profesional)?.nombre ?? "—"} · {uno(r.sede)?.nombre ?? "—"}
                </span>
              </div>
              <span className="text-xs text-stone-400">{formatoFecha(r.created_at)}</span>
            </div>
            {r.comentario && <p className="mt-1 text-sm text-stone-600">&ldquo;{r.comentario}&rdquo;</p>}
          </div>
        ))}
        {filtradas.length === 0 && <p className="p-3 text-sm text-stone-400">Todavía no hay opiniones.</p>}
      </div>
    </div>
  );
}

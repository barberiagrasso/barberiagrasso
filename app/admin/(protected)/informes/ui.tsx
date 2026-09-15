"use client";

import type { ReactNode } from "react";
import { descargarCSV } from "@/lib/csvExport";
import { euros } from "@/lib/formato";

// Reexportado (en vez de re-implementado) para que SeccionIngresos.tsx y
// compañía sigan importando `euros` desde aquí sin tocarlas — la
// implementación real vive en lib/formato.ts porque Comisiones también
// la necesita y no está bajo esta misma carpeta de informes/.
export { euros };

// Piezas reutilizables por las 4 secciones de informes (tarjetas de KPI,
// contenedor de gráfica con título + acción, botón de exportar CSV) —
// para que cada Seccion*.tsx se centre en sus propios datos y no repita
// el mismo marcado una y otra vez.

// Paleta de colores para las gráficas (recharts pide colores literales,
// no clases de Tailwind), a partir de los colores de marca + un puñado de
// colores neutros para series adicionales.
export const COLORES_GRAFICA = [
  "#f2d368", // brand-yellow
  "#44403c", // stone-700
  "#0ea5e9", // sky-500
  "#10b981", // emerald-500
  "#ef4444", // red-500
  "#a855f7", // purple-500
  "#f97316", // orange-500
  "#64748b", // slate-500
];


export function formatoVariacion(pctVar: number | null): { texto: string; color: "verde" | "rojo" | "neutro" } {
  if (pctVar === null) return { texto: "sin datos del periodo anterior", color: "neutro" };
  if (pctVar === 0) return { texto: "igual que el periodo anterior", color: "neutro" };
  const signo = pctVar > 0 ? "+" : "";
  return { texto: `${signo}${pctVar}% vs. periodo anterior`, color: pctVar > 0 ? "verde" : "rojo" };
}

export function TarjetaKPI({
  etiqueta,
  valor,
  subtitulo,
  colorSubtitulo = "neutro",
}: {
  etiqueta: string;
  valor: string;
  subtitulo?: string;
  colorSubtitulo?: "verde" | "rojo" | "neutro";
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-stone-500">{etiqueta}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{valor}</div>
      {subtitulo && (
        <div
          className={
            "mt-1 text-xs " +
            (colorSubtitulo === "verde" ? "text-emerald-600" : colorSubtitulo === "rojo" ? "text-red-600" : "text-stone-400")
          }
        >
          {subtitulo}
        </div>
      )}
    </div>
  );
}

export function BotonExportarCSV({ nombreArchivo, filas }: { nombreArchivo: string; filas: Record<string, string | number>[] }) {
  return (
    <button
      onClick={() => descargarCSV(nombreArchivo, filas)}
      disabled={filas.length === 0}
      className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark disabled:opacity-40 disabled:no-underline"
    >
      Exportar CSV
    </button>
  );
}

export function TarjetaGrafica({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wider text-stone-500">{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  );
}

export function SinDatos({ children = "Sin datos en este rango." }: { children?: ReactNode }) {
  return <p className="py-6 text-center text-sm text-stone-400">{children}</p>;
}

export function Cargando() {
  return <p className="text-sm text-stone-500">Calculando…</p>;
}

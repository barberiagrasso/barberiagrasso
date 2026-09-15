"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { euros } from "./ui";
import { mesActualStr, sumarMeses, etiquetaMes, type TramoComision } from "@/lib/comisiones";

interface FilaComision {
  profesionalId: string;
  nombre: string;
  facturacionCentimos: number;
  citasCompletadas: number;
  comisionCentimos: number;
  tramo: TramoComision | null;
}

// A diferencia de las otras 3 secciones de Informes, esta no usa el
// rango de fechas global del panel (desde/hasta): los tramos de
// comisión son mensuales por definición, así que tiene su propio
// selector de mes. Solo se ve desde /admin/informes, que ya exige rol
// "admin" (requireRolAdmin en la página), así que aquí siempre se ve a
// todo el equipo — la vista de "solo mi comisión" para un barbero vive
// en /admin/comisiones.
export default function SeccionComisiones() {
  const [mes, setMes] = useState(mesActualStr());
  const [datos, setDatos] = useState<{ filas: FilaComision[]; totalComisionCentimos: number; totalFacturacionCentimos: number } | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/admin/comisiones?mes=${mes}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargando(false));
  }, [mes]);

  const esMesActual = mes === mesActualStr();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setMes((m) => sumarMeses(m, -1))} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400" aria-label="Mes anterior">
            ‹
          </button>
          <span className="w-40 text-center font-mono text-sm text-stone-700">{etiquetaMes(mes)}</span>
          <button
            onClick={() => setMes((m) => sumarMeses(m, 1))}
            disabled={esMesActual}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400 disabled:opacity-30"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
        <Link href="/admin/comisiones" className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark">
          Editar tramos de comisión →
        </Link>
      </div>

      {cargando && !datos ? (
        <p className="text-sm text-stone-500">Calculando…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Facturación del equipo</div>
              <div className="mt-1 text-2xl font-bold text-stone-900">{euros(datos?.totalFacturacionCentimos ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Comisiones a pagar</div>
              <div className="mt-1 text-2xl font-bold text-stone-900">{euros(datos?.totalComisionCentimos ?? 0)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-stone-500">Comisión por barbero</h3>
            {(datos?.filas.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-stone-400">No hay ningún barbero de alta.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500">
                      <th className="py-2 pr-3 font-mono font-normal">Barbero</th>
                      <th className="py-2 pr-3 font-mono font-normal">Citas</th>
                      <th className="py-2 pr-3 font-mono font-normal">Facturación</th>
                      <th className="py-2 pr-3 font-mono font-normal">Tramo</th>
                      <th className="py-2 pr-3 font-mono font-normal">Comisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {datos?.filas.map((f) => (
                      <tr key={f.profesionalId}>
                        <td className="py-2 pr-3 text-stone-800">{f.nombre}</td>
                        <td className="py-2 pr-3 text-stone-500">{f.citasCompletadas}</td>
                        <td className="py-2 pr-3 font-mono text-stone-900">{euros(f.facturacionCentimos)}</td>
                        <td className="py-2 pr-3">
                          {f.tramo ? (
                            <span className="rounded-full bg-brand-yellow/20 px-2 py-0.5 text-xs font-semibold text-brand-yellow-dark">{f.tramo.porcentaje}%</span>
                          ) : (
                            <span className="text-xs text-stone-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono font-semibold text-stone-900">{euros(f.comisionCentimos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

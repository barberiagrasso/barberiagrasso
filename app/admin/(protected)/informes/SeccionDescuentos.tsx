"use client";

import { useEffect, useState } from "react";
import { euros, TarjetaKPI, BotonExportarCSV, SinDatos, Cargando } from "./ui";

interface FilaDescuento {
  id: string;
  inicio: string;
  clienteNombre: string;
  servicioNombre: string;
  profesionalNombre: string;
  porcentaje: number;
  motivo: string;
  automaticoCentimos: number;
  cobradoCentimos: number;
  descuentoCentimos: number;
}

interface Datos {
  filas: FilaDescuento[];
  totalDescuentos: number;
  totalDescuentosCentimos: number;
}

function formatoFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

/**
 * Todos los descuentos por % con motivo aplicados desde el checkout del
 * panel (FinalizarCitaModal.tsx) en el rango de fechas elegido — para que
 * Diego pueda revisar de un vistazo qué ofertas o detalles puntuales se
 * han dado, cuánto ha dejado de ingresar la barbería por ellos y quién
 * los aplicó. El barbero sigue comisionando por el total sin descontar
 * (ver ingresoCitaCentimos en app/api/admin/comisiones/route.ts): esta
 * pestaña es solo de consulta, no cambia ningún cálculo.
 */
export default function SeccionDescuentos({ sedeId, desde, hasta }: { sedeId: string; desde: string; hasta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    const params = new URLSearchParams({ sedeId, desde, hasta });
    fetch(`/api/admin/informes/descuentos?${params}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargando(false));
  }, [sedeId, desde, hasta]);

  if (cargando && !datos) return <Cargando />;
  if (!datos) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TarjetaKPI etiqueta="Descuentos aplicados" valor={String(datos.totalDescuentos)} />
        <TarjetaKPI etiqueta="Importe total descontado" valor={euros(datos.totalDescuentosCentimos)} colorSubtitulo="rojo" />
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-stone-500">Detalle de descuentos</h3>
          <BotonExportarCSV
            nombreArchivo="descuentos"
            filas={datos.filas.map((f) => ({
              fecha: formatoFechaHora(f.inicio),
              cliente: f.clienteNombre,
              servicio: f.servicioNombre,
              barbero: f.profesionalNombre,
              porcentaje: f.porcentaje,
              motivo: f.motivo,
              precio_catalogo: (f.automaticoCentimos / 100).toFixed(2),
              precio_cobrado: (f.cobradoCentimos / 100).toFixed(2),
              importe_descontado: (f.descuentoCentimos / 100).toFixed(2),
            }))}
          />
        </div>
        {datos.filas.length === 0 ? (
          <SinDatos>Sin descuentos aplicados en este rango.</SinDatos>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wider text-stone-500">
                  <th className="py-2 pr-3 font-mono font-normal">Fecha</th>
                  <th className="py-2 pr-3 font-mono font-normal">Cliente</th>
                  <th className="py-2 pr-3 font-mono font-normal">Servicio</th>
                  <th className="py-2 pr-3 font-mono font-normal">Barbero</th>
                  <th className="py-2 pr-3 font-mono font-normal">%</th>
                  <th className="py-2 pr-3 font-mono font-normal">Motivo</th>
                  <th className="py-2 pr-3 font-mono font-normal">Descontado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {datos.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2 pr-3 text-stone-500">{formatoFechaHora(f.inicio)}</td>
                    <td className="py-2 pr-3 text-stone-800">{f.clienteNombre}</td>
                    <td className="py-2 pr-3 text-stone-700">{f.servicioNombre}</td>
                    <td className="py-2 pr-3 text-stone-700">{f.profesionalNombre}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-brand-yellow/20 px-2 py-0.5 text-xs font-semibold text-brand-yellow-dark">{f.porcentaje}%</span>
                    </td>
                    <td className="py-2 pr-3 text-stone-600">{f.motivo}</td>
                    <td className="py-2 pr-3 font-mono font-semibold text-red-600">−{euros(f.descuentoCentimos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { euros, TarjetaKPI, TarjetaGrafica, BotonExportarCSV, SinDatos, Cargando } from "./ui";

interface Datos {
  nuevosCount: number;
  recurrentesCount: number;
  tasaRecurrenciaHistoricaPct: number;
  clientesEnRiesgo: number;
  ingresosTotalRangoCentimos: number;
  clientesDistintosEnRango: number;
  valorMedioPorClienteCentimos: number;
  topClientes: { nombre: string; ingresosCentimos: number; visitas: number }[];
  serieNuevosRecurrentes: { etiqueta: string; nuevos: number; recurrentes: number }[];
}

export default function SeccionClientes({ sedeId, desde, hasta }: { sedeId: string; desde: string; hasta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    const params = new URLSearchParams({ sedeId, desde, hasta });
    fetch(`/api/admin/informes/clientes?${params}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargando(false));
  }, [sedeId, desde, hasta]);

  if (cargando && !datos) return <Cargando />;
  if (!datos) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaKPI etiqueta="Nuevos vs. recurrentes" valor={`${datos.nuevosCount} / ${datos.recurrentesCount}`} subtitulo="en este rango" />
        <TarjetaKPI etiqueta="Tasa de recurrencia" valor={`${datos.tasaRecurrenciaHistoricaPct}%`} subtitulo="histórica, de toda la vida del negocio" />
        <TarjetaKPI etiqueta="Valor medio por cliente" valor={euros(datos.valorMedioPorClienteCentimos)} subtitulo={`${datos.clientesDistintosEnRango} clientes distintos`} />
        <TarjetaKPI
          etiqueta="Clientes en riesgo"
          valor={String(datos.clientesEnRiesgo)}
          subtitulo="45-89 días sin volver"
          colorSubtitulo={datos.clientesEnRiesgo > 0 ? "rojo" : "neutro"}
        />
      </div>

      <TarjetaGrafica titulo="Nuevos vs. recurrentes en el tiempo">
        {datos.serieNuevosRecurrentes.every((p) => p.nuevos === 0 && p.recurrentes === 0) ? (
          <SinDatos />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={datos.serieNuevosRecurrentes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="nuevos" name="Nuevos" stackId="a" fill="#f2d368" radius={[0, 0, 0, 0]} />
              <Bar dataKey="recurrentes" name="Recurrentes" stackId="a" fill="#44403c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo="Top clientes por gasto en el rango"
        accion={
          <BotonExportarCSV
            nombreArchivo="top-clientes"
            filas={datos.topClientes.map((c) => ({ cliente: c.nombre, visitas: c.visitas, gasto_euros: (c.ingresosCentimos / 100).toFixed(2) }))}
          />
        }
      >
        {datos.topClientes.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="divide-y divide-stone-100 text-sm">
            {datos.topClientes.map((c) => (
              <div key={c.nombre} className="flex items-center justify-between py-1.5">
                <span className="text-stone-700">{c.nombre}</span>
                <span className="text-stone-500">
                  {c.visitas} visita{c.visitas === 1 ? "" : "s"} · <span className="font-mono text-stone-900">{euros(c.ingresosCentimos)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </TarjetaGrafica>
    </div>
  );
}

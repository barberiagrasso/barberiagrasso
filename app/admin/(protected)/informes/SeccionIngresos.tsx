"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { euros, formatoVariacion, TarjetaKPI, TarjetaGrafica, BotonExportarCSV, SinDatos, Cargando, COLORES_GRAFICA } from "./ui";

interface Datos {
  ingresosTotalCentimos: number;
  ticketMedioCentimos: number;
  citasCompletadasCount: number;
  ingresosAnteriorCentimos: number | null;
  variacionIngresosPct: number | null;
  citasAnteriorCount: number | null;
  serieIngresos: { etiqueta: string; ingresosCentimos: number }[];
  ingresosPorSede: { nombre: string; ingresosCentimos: number }[];
  ingresosPorBarbero: { nombre: string; ingresosCentimos: number }[];
  topServicios: { nombre: string; cantidad: number; ingresosCentimos: number }[];
  porCanal: { canal: string; citas: number; ingresosCentimos: number }[];
}

const ETIQUETA_CANAL: Record<string, string> = { app: "Web", panel: "Panel (a mano)", whatsapp: "WhatsApp" };

export default function SeccionIngresos({
  sedeId,
  nombreSede,
  desde,
  hasta,
  comparar,
}: {
  sedeId: string;
  nombreSede: string;
  desde: string;
  hasta: string;
  comparar: boolean;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    const params = new URLSearchParams({ sedeId, desde, hasta, comparar: comparar ? "1" : "0" });
    fetch(`/api/admin/informes/resumen?${params}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargando(false));
  }, [sedeId, desde, hasta, comparar]);

  if (cargando && !datos) return <Cargando />;
  if (!datos) return null;

  const variacion = formatoVariacion(datos.variacionIngresosPct);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TarjetaKPI
          etiqueta="Ingresos"
          valor={euros(datos.ingresosTotalCentimos)}
          subtitulo={comparar ? variacion.texto : undefined}
          colorSubtitulo={variacion.color}
        />
        <TarjetaKPI etiqueta="Ticket medio" valor={euros(datos.ticketMedioCentimos)} />
        <TarjetaKPI
          etiqueta="Citas completadas"
          valor={String(datos.citasCompletadasCount)}
          subtitulo={
            comparar && datos.citasAnteriorCount !== null
              ? `${datos.citasAnteriorCount} en el periodo anterior`
              : undefined
          }
        />
      </div>

      <TarjetaGrafica titulo={`Tendencia de ingresos — ${nombreSede}`}>
        {datos.serieIngresos.every((p) => p.ingresosCentimos === 0) ? (
          <SinDatos />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={datos.serieIngresos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 100)}€`} />
              <Tooltip formatter={(v) => euros(Number(v))} />
              <Line type="monotone" dataKey="ingresosCentimos" name="Ingresos" stroke="#d8b23a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </TarjetaGrafica>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TarjetaGrafica titulo="Ingresos por sede">
          {datos.ingresosPorSede.length === 0 ? (
            <SinDatos />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datos.ingresosPorSede}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 100)}€`} />
                <Tooltip formatter={(v) => euros(Number(v))} />
                <Bar dataKey="ingresosCentimos" name="Ingresos" fill="#f2d368" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TarjetaGrafica>

        <TarjetaGrafica titulo="Ingresos por barbero">
          {datos.ingresosPorBarbero.length === 0 ? (
            <SinDatos />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datos.ingresosPorBarbero} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 100)}€`} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => euros(Number(v))} />
                <Bar dataKey="ingresosCentimos" name="Ingresos" fill="#f2d368" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TarjetaGrafica>
      </div>

      <TarjetaGrafica
        titulo="Servicios y complementos más rentables"
        accion={
          <BotonExportarCSV
            nombreArchivo="ingresos-por-servicio"
            filas={datos.topServicios.map((s) => ({ servicio: s.nombre, veces: s.cantidad, ingresos_euros: (s.ingresosCentimos / 100).toFixed(2) }))}
          />
        }
      >
        {datos.topServicios.length === 0 ? (
          <SinDatos />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(180, datos.topServicios.length * 32)}>
              <BarChart data={datos.topServicios} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 100)}€`} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={160} />
                <Tooltip formatter={(v, n) => (n === "Ingresos" ? euros(Number(v)) : v)} />
                <Bar dataKey="ingresosCentimos" name="Ingresos" fill="#d8b23a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 divide-y divide-stone-100 text-sm">
              {datos.topServicios.map((s) => (
                <div key={s.nombre} className="flex items-center justify-between py-1.5">
                  <span className="text-stone-700">{s.nombre}</span>
                  <span className="text-stone-500">
                    {s.cantidad} veces · <span className="font-mono text-stone-900">{euros(s.ingresosCentimos)}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </TarjetaGrafica>

      <TarjetaGrafica titulo="Ingresos por canal de reserva">
        {datos.porCanal.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={200} className="max-w-xs">
              <PieChart>
                <Pie
                  data={datos.porCanal}
                  dataKey="ingresosCentimos"
                  nameKey="canal"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entrada) => ETIQUETA_CANAL[String(entrada.name)] ?? entrada.name}
                >
                  {datos.porCanal.map((_, i) => (
                    <Cell key={i} fill={COLORES_GRAFICA[i % COLORES_GRAFICA.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => euros(Number(v))} />
                <Legend formatter={(valor: string) => ETIQUETA_CANAL[valor] ?? valor} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 divide-y divide-stone-100 text-sm">
              {datos.porCanal.map((c) => (
                <div key={c.canal} className="flex items-center justify-between py-1.5">
                  <span className="text-stone-700">{ETIQUETA_CANAL[c.canal] ?? c.canal}</span>
                  <span className="text-stone-500">
                    {c.citas} citas · <span className="font-mono text-stone-900">{euros(c.ingresosCentimos)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </TarjetaGrafica>
    </div>
  );
}

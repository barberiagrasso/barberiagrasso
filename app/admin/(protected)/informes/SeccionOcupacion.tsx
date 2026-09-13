"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { TarjetaKPI, TarjetaGrafica, BotonExportarCSV, SinDatos, Cargando } from "./ui";

interface Datos {
  ocupacionLimitada: boolean;
  ocupacionGlobalPct: number;
  ocupacionPorHora: { hora: number; ocupadas: number; capacidad: number; pct: number }[];
  ocupacionPorBarbero: { nombre: string; ocupadas: number; capacidad: number; pct: number }[];
  ocupacionPorDiaSemana: { nombre: string; ocupadas: number; capacidad: number; pct: number }[];
}

export default function SeccionOcupacion({ sedeId, desde, hasta }: { sedeId: string; desde: string; hasta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    const params = new URLSearchParams({ sedeId, desde, hasta });
    fetch(`/api/admin/informes/ocupacion?${params}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargando(false));
  }, [sedeId, desde, hasta]);

  if (cargando && !datos) return <Cargando />;
  if (!datos) return null;

  if (datos.ocupacionLimitada) {
    return <p className="text-sm text-amber-700">El rango es muy largo (más de 4 meses); acórtalo para ver la ocupación.</p>;
  }

  return (
    <div className="space-y-5">
      <TarjetaKPI etiqueta="Ocupación global" valor={`${datos.ocupacionGlobalPct}%`} />

      <TarjetaGrafica titulo="Ocupación por franja horaria">
        <p className="mb-2 text-xs text-stone-400">
          Estimado a partir del horario semanal y los bloqueos: compara cuántas citas empezaron en cada hora con
          cuántos huecos de barbero había disponibles.
        </p>
        {datos.ocupacionPorHora.length === 0 ? (
          <SinDatos>Sin horario configurado para esta selección.</SinDatos>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={datos.ocupacionPorHora.map((h) => ({ ...h, etiqueta: `${String(h.hora).padStart(2, "0")}:00` }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${Number(v)}%`, "Ocupación"]} />
              <Bar dataKey="pct" name="pct" fill="#f2d368" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </TarjetaGrafica>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TarjetaGrafica
          titulo="Ocupación por barbero"
          accion={
            <BotonExportarCSV
              nombreArchivo="ocupacion-por-barbero"
              filas={datos.ocupacionPorBarbero.map((b) => ({ barbero: b.nombre, ocupadas_h: b.ocupadas, capacidad_h: b.capacidad, ocupacion_pct: b.pct }))}
            />
          }
        >
          {datos.ocupacionPorBarbero.length === 0 ? (
            <SinDatos />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, datos.ocupacionPorBarbero.length * 34)}>
              <BarChart data={datos.ocupacionPorBarbero} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v) => `${Number(v)}%`} />
                <Bar dataKey="pct" name="Ocupación" fill="#d8b23a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TarjetaGrafica>

        <TarjetaGrafica titulo="Ocupación por día de la semana">
          {datos.ocupacionPorDiaSemana.length === 0 ? (
            <SinDatos />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={datos.ocupacionPorDiaSemana}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v) => `${Number(v)}%`} />
                <Bar dataKey="pct" name="Ocupación" fill="#f2d368" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TarjetaGrafica>
      </div>
    </div>
  );
}

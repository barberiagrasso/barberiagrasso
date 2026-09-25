"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { euros, TarjetaKPI, TarjetaGrafica, BotonExportarCSV, SinDatos, Cargando } from "./ui";

interface Fila {
  nombre?: string;
  canal?: string;
  completadas: number;
  noPresentadas: number;
  canceladas: number;
  pctNoShow: number;
}

interface Datos {
  totalCitas: number;
  noPresentadasCount: number;
  canceladasCount: number;
  completadasCount: number;
  pctNoShow: number;
  pctCancelacion: number;
  ingresosPerdidosCentimos: number;
  porBarbero: Fila[];
  porServicio: Fila[];
  porCanal: Fila[];
  tendencia: { etiqueta: string; pctNoShow: number; canceladas: number }[];
}

const ETIQUETA_CANAL: Record<string, string> = { app: "Web", app_asistente: "Asistente IA", panel: "Panel (a mano)", whatsapp: "WhatsApp" };

export default function SeccionNoShows({ sedeId, desde, hasta }: { sedeId: string; desde: string; hasta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCargando(true);
    const params = new URLSearchParams({ sedeId, desde, hasta });
    fetch(`/api/admin/informes/no-shows?${params}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargando(false));
  }, [sedeId, desde, hasta]);

  if (cargando && !datos) return <Cargando />;
  if (!datos) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TarjetaKPI etiqueta="No presentados" valor={`${datos.pctNoShow}%`} subtitulo={`${datos.noPresentadasCount} citas`} />
        <TarjetaKPI etiqueta="Cancelaciones" valor={`${datos.pctCancelacion}%`} subtitulo={`${datos.canceladasCount} citas`} />
        <TarjetaKPI etiqueta="Ingresos perdidos (estimado)" valor={euros(datos.ingresosPerdidosCentimos)} colorSubtitulo="rojo" />
      </div>

      <TarjetaGrafica titulo="Tendencia en el tiempo">
        {datos.tendencia.every((p) => p.canceladas === 0 && p.pctNoShow === 0) ? (
          <SinDatos />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={datos.tendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="izq" tick={{ fontSize: 11 }} label={{ value: "Canceladas", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <YAxis yAxisId="der" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="izq" dataKey="canceladas" name="Canceladas" fill="#64748b" radius={[4, 4, 0, 0]} />
              <Line yAxisId="der" type="monotone" dataKey="pctNoShow" name="% no presentados" stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo="Por barbero"
        accion={
          <BotonExportarCSV
            nombreArchivo="no-shows-por-barbero"
            filas={datos.porBarbero.map((b) => ({
              barbero: b.nombre ?? "",
              completadas: b.completadas,
              no_presentadas: b.noPresentadas,
              canceladas: b.canceladas,
              pct_no_show: b.pctNoShow,
            }))}
          />
        }
      >
        {datos.porBarbero.length === 0 ? (
          <SinDatos />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, datos.porBarbero.length * 34)}>
            <BarChart data={datos.porBarbero} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={(v) => `${Number(v)}%`} />
              <Bar dataKey="pctNoShow" name="% no presentados" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo="Por servicio"
        accion={
          <BotonExportarCSV
            nombreArchivo="no-shows-por-servicio"
            filas={datos.porServicio.map((s) => ({
              servicio: s.nombre ?? "",
              completadas: s.completadas,
              no_presentadas: s.noPresentadas,
              canceladas: s.canceladas,
              pct_no_show: s.pctNoShow,
            }))}
          />
        }
      >
        {datos.porServicio.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="divide-y divide-stone-100 text-sm">
            <div className="flex items-center justify-between py-1.5 font-mono text-xs uppercase tracking-wider text-stone-400">
              <span>Servicio</span>
              <span>Completadas / No presentadas / Canceladas</span>
            </div>
            {datos.porServicio.slice(0, 12).map((s) => (
              <div key={s.nombre} className="flex items-center justify-between py-1.5">
                <span className="text-stone-700">{s.nombre}</span>
                <span className="font-mono text-stone-500">
                  {s.completadas} / <span className="text-red-600">{s.noPresentadas}</span> /{" "}
                  <span className="text-stone-500">{s.canceladas}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </TarjetaGrafica>

      <TarjetaGrafica titulo="Por canal de reserva">
        {datos.porCanal.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="divide-y divide-stone-100 text-sm">
            {datos.porCanal.map((c) => (
              <div key={c.canal} className="flex items-center justify-between py-1.5">
                <span className="text-stone-700">{ETIQUETA_CANAL[c.canal ?? ""] ?? c.canal}</span>
                <span className="text-stone-500">
                  {c.pctNoShow}% no presentados · {c.canceladas} canceladas
                </span>
              </div>
            ))}
          </div>
        )}
      </TarjetaGrafica>
    </div>
  );
}

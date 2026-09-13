"use client";

import { useState } from "react";
import SeccionIngresos from "./SeccionIngresos";
import SeccionOcupacion from "./SeccionOcupacion";
import SeccionNoShows from "./SeccionNoShows";
import SeccionClientes from "./SeccionClientes";

interface Sede {
  id: string;
  nombre: string;
}

type Pestana = "ingresos" | "ocupacion" | "no-shows" | "clientes";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "ingresos", etiqueta: "Ingresos" },
  { clave: "ocupacion", etiqueta: "Ocupación" },
  { clave: "no-shows", etiqueta: "No presentados y cancelaciones" },
  { clave: "clientes", etiqueta: "Clientes" },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaISO(d);
}
function hoyISO(): string {
  return fechaISO(new Date());
}

// Atajos de rango de fechas: cada uno calcula su propio [desde, hasta] a
// partir de hoy, para no tener que tocar los selectores de fecha a mano
// para las consultas más habituales.
const ATAJOS: { etiqueta: string; calcular: () => { desde: string; hasta: string } }[] = [
  { etiqueta: "Hoy", calcular: () => ({ desde: hoyISO(), hasta: hoyISO() }) },
  { etiqueta: "7 días", calcular: () => ({ desde: sumarDias(hoyISO(), -6), hasta: hoyISO() }) },
  { etiqueta: "30 días", calcular: () => ({ desde: sumarDias(hoyISO(), -29), hasta: hoyISO() }) },
  {
    etiqueta: "Este mes",
    calcular: () => {
      const hoy = new Date();
      return { desde: fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: hoyISO() };
    },
  },
  {
    etiqueta: "Mes pasado",
    calcular: () => {
      const hoy = new Date();
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: fechaISO(inicio), hasta: fechaISO(fin) };
    },
  },
  {
    etiqueta: "Este año",
    calcular: () => {
      const hoy = new Date();
      return { desde: fechaISO(new Date(hoy.getFullYear(), 0, 1)), hasta: hoyISO() };
    },
  },
];

export default function InformesClient({ sedes }: { sedes: Sede[] }) {
  const [sedeId, setSedeId] = useState("todas");
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -29));
  const [hasta, setHasta] = useState(hoyISO());
  const [comparar, setComparar] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("ingresos");

  const nombreSede = sedeId === "todas" ? "Todas las sedes" : sedes.find((s) => s.id === sedeId)?.nombre ?? "";

  return (
    <div className="space-y-5">
      {/* --- Filtros globales: afectan a las 4 secciones --- */}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-xs uppercase tracking-wider text-stone-500">Sede</span>
          <button
            onClick={() => setSedeId("todas")}
            className={
              "rounded-lg border px-3 py-1.5 text-sm " +
              (sedeId === "todas" ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400")
            }
          >
            Todas
          </button>
          {sedes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSedeId(s.id)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm " +
                (sedeId === s.id ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400")
              }
            >
              {s.nombre}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-xs uppercase tracking-wider text-stone-500">Rango</span>
          {ATAJOS.map((a) => (
            <button
              key={a.etiqueta}
              onClick={() => {
                const { desde: d, hasta: h } = a.calcular();
                setDesde(d);
                setHasta(h);
              }}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400"
            >
              {a.etiqueta}
            </button>
          ))}
          <span className="ml-2 text-sm text-stone-500">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-stone-300 p-1.5 text-sm" />
          <span className="text-sm text-stone-500">hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-stone-300 p-1.5 text-sm" />
          <label className="ml-2 flex items-center gap-1.5 text-sm text-stone-600">
            <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="accent-brand-yellow" />
            Comparar con el periodo anterior
          </label>
        </div>
      </div>

      {/* --- Pestañas --- */}
      <div className="flex flex-wrap gap-1 border-b border-stone-200">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestana(p.clave)}
            className={
              "rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (pestana === p.clave ? "border-brand-yellow text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800")
            }
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* Las 4 secciones se quedan montadas siempre (solo se ocultan con
          CSS) para no tener que volver a pedir los datos cada vez que se
          cambia de pestaña — solo se recargan si cambian los filtros. */}
      <div className={pestana === "ingresos" ? "" : "hidden"}>
        <SeccionIngresos sedeId={sedeId} nombreSede={nombreSede} desde={desde} hasta={hasta} comparar={comparar} />
      </div>
      <div className={pestana === "ocupacion" ? "" : "hidden"}>
        <SeccionOcupacion sedeId={sedeId} desde={desde} hasta={hasta} />
      </div>
      <div className={pestana === "no-shows" ? "" : "hidden"}>
        <SeccionNoShows sedeId={sedeId} desde={desde} hasta={hasta} />
      </div>
      <div className={pestana === "clientes" ? "" : "hidden"}>
        <SeccionClientes sedeId={sedeId} desde={desde} hasta={hasta} />
      </div>
    </div>
  );
}

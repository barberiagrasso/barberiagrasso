"use client";

import { useState } from "react";
import { CATEGORIAS_CONOCIDAS } from "../servicios/ServiciosClient";

// Servicios del cartel "¿Qué estilo llevas hoy?". Precio en euros como
// texto ("" = falta ponerlo). Duraciones orientativas: revísalas.
const PROPUESTOS = [
  { nombre: "Mechas", categoria: "Tintes Grasso", precio: "44,99", minutos: "60", variable: false, descripcion: "" },
  { nombre: "Rubio platino", categoria: "Tintes Grasso", precio: "69,90", minutos: "120", variable: false, descripcion: "" },
  { nombre: "Camuflaje de canas", categoria: "Tintes Grasso", precio: "", minutos: "20", variable: false, descripcion: "" },
  {
    nombre: "Alisado (brasileño o botox)",
    categoria: "Tratamientos capilares",
    precio: "19,00",
    minutos: "60",
    variable: true,
    descripcion: "De 19 € a 30 € según el tipo: alisado brasileño o alisado botox.",
  },
  { nombre: "Hidratación capilar", categoria: "Tratamientos capilares", precio: "", minutos: "20", variable: false, descripcion: "" },
  { nombre: "Limpieza facial", categoria: "Complementos", precio: "", minutos: "20", variable: false, descripcion: "" },
  { nombre: "Perfilado de cejas", categoria: "Complementos", precio: "", minutos: "5", variable: false, descripcion: "" },
  { nombre: "Depilación de nariz y orejas con cera", categoria: "Complementos", precio: "", minutos: "5", variable: false, descripcion: "" },
];

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function ImportarServiciosClient({ existentes }: { existentes: string[] }) {
  const yaExiste = new Set(existentes.map(normalizar));
  const [filas, setFilas] = useState(
    PROPUESTOS.map((p) => ({ ...p, existe: yaExiste.has(normalizar(p.nombre)), marcado: !yaExiste.has(normalizar(p.nombre)) })),
  );
  const [estado, setEstado] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  function cambiar(i: number, campo: string, valor: string | boolean) {
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  }

  const aCrear = filas.filter((f) => f.marcado && !f.existe);
  const faltanPrecios = aCrear.filter((f) => !f.precio.trim());

  async function crear() {
    setGuardando(true);
    for (const f of aCrear) {
      const precio = Math.round(Number(f.precio.replace(",", ".")) * 100);
      const minutos = Number(f.minutos);
      if (!Number.isFinite(precio) || precio < 0 || !Number.isInteger(minutos) || minutos <= 0) {
        setEstado((e) => ({ ...e, [f.nombre]: "Revisa precio y minutos" }));
        continue;
      }
      const res = await fetch("/api/admin/servicios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: f.nombre,
          descripcion: f.descripcion || null,
          duracion_minutos: minutos,
          precio_centimos: precio,
          categoria: f.categoria,
          precio_variable: f.variable,
          activo: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      setEstado((e) => ({ ...e, [f.nombre]: res.ok ? "✓ Creado" : json.error || "Error" }));
      if (res.ok) setFilas((fs) => fs.map((x) => (x.nombre === f.nombre ? { ...x, existe: true } : x)));
    }
    setGuardando(false);
  }

  return (
    <div className="space-y-3">
      {filas.map((f, i) => (
        <div key={f.nombre} className={"rounded-lg border bg-white p-3 " + (f.existe ? "border-stone-100 opacity-60" : "border-stone-200")}>
          <div className="flex items-center gap-2">
            <input type="checkbox" disabled={f.existe} checked={f.marcado && !f.existe} onChange={(e) => cambiar(i, "marcado", e.target.checked)} />
            <span className="font-semibold text-stone-900">{f.nombre}</span>
            {f.existe && <span className="text-xs text-stone-500">(ya existe)</span>}
            {estado[f.nombre] && <span className="ml-auto text-xs font-semibold text-emerald-700">{estado[f.nombre]}</span>}
          </div>
          {!f.existe && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-stone-600">
              <label>
                {f.variable ? "Desde" : "Precio"}{" "}
                <input
                  value={f.precio}
                  onChange={(e) => cambiar(i, "precio", e.target.value)}
                  inputMode="decimal"
                  placeholder="€"
                  className={"w-20 rounded border px-2 py-1 " + (!f.precio && f.marcado ? "border-red-300 bg-red-50" : "border-stone-300")}
                />{" "}
                €
              </label>
              <label>
                Duración{" "}
                <input value={f.minutos} onChange={(e) => cambiar(i, "minutos", e.target.value)} inputMode="numeric" className="w-14 rounded border border-stone-300 px-2 py-1" /> min
              </label>
              <label>
                Grupo{" "}
                <select value={f.categoria} onChange={(e) => cambiar(i, "categoria", e.target.value)} className="rounded border border-stone-300 px-2 py-1">
                  {CATEGORIAS_CONOCIDAS.filter((g) => g !== "Grasso Kids (hasta 7 años)").map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              {f.variable && <span className="text-xs text-stone-400">{f.descripcion}</span>}
            </div>
          )}
        </div>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <button
          onClick={crear}
          disabled={guardando || aCrear.length === 0 || faltanPrecios.length > 0}
          className="rounded-none bg-brand-black px-4 py-2 text-sm font-medium uppercase tracking-wide text-brand-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {guardando ? "Creando…" : `Crear servicios (${aCrear.length})`}
        </button>
        {faltanPrecios.length > 0 && (
          <span className="text-xs text-red-600">Falta el precio de: {faltanPrecios.map((f) => f.nombre).join(", ")}. Ponlo o desmárcalo.</span>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { euros } from "@/lib/formato";
import { descargarCSV } from "@/lib/csvExport";
import { mesActualStr, sumarMeses, etiquetaMes, validarTramos, type TramoComision } from "@/lib/comisiones";
import VistaBarbero from "./VistaBarbero";

interface TramoConId extends TramoComision {
  id: string;
}

interface FilaComision {
  profesionalId: string;
  nombre: string;
  facturacionCentimos: number;
  citasCompletadas: number;
  comisionCentimos: number;
  tramo: TramoComision | null;
  siguienteTramo: TramoComision | null;
  posicion: number;
  totalBarberos: number;
  productosCentimos: number;
  comisionProductosCentimos: number;
}

interface FilaEditable {
  desdeEuros: string;
  hastaEuros: string; // "" = sin límite superior
  porcentaje: string;
}

function centimosAEuros(centimos: number): string {
  return (centimos / 100).toString();
}
function eurosACentimos(euros: string): number {
  return Math.round(Number(euros.replace(",", ".")) * 100);
}

interface DatosComisiones {
  filas: FilaComision[];
  totalComisionCentimos: number;
  totalFacturacionCentimos: number;
  totalProductosCentimos: number;
  totalComisionProductosCentimos: number;
  porcentajeProductos: number;
}

export default function ComisionesClient({ rol }: { rol: string }) {
  const [mes, setMes] = useState(mesActualStr());
  const [datos, setDatos] = useState<DatosComisiones | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  const [tramos, setTramos] = useState<TramoConId[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [filasEditables, setFilasEditables] = useState<FilaEditable[]>([]);
  const [errorTramos, setErrorTramos] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState(false);

  const [editandoPct, setEditandoPct] = useState(false);
  const [pctEditable, setPctEditable] = useState("");
  const [errorPct, setErrorPct] = useState<string | null>(null);
  const [guardandoPct, setGuardandoPct] = useState(false);

  function cargarTramos() {
    fetch("/api/admin/comisiones/tramos")
      .then((r) => r.json())
      .then((json) => setTramos(json.tramos ?? []));
  }

  useEffect(() => {
    cargarTramos();
  }, []);

  useEffect(() => {
    setCargandoDatos(true);
    fetch(`/api/admin/comisiones?mes=${mes}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargandoDatos(false));
  }, [mes]);

  function empezarEdicion() {
    setFilasEditables(
      (tramos ?? []).map((t) => ({
        desdeEuros: centimosAEuros(t.desdeCentimos),
        hastaEuros: t.hastaCentimos === null ? "" : centimosAEuros(t.hastaCentimos),
        porcentaje: String(t.porcentaje),
      }))
    );
    setErrorTramos(null);
    setAvisoGuardado(false);
    setEditando(true);
  }

  function cancelarEdicion() {
    setEditando(false);
    setErrorTramos(null);
  }

  function actualizarFila(indice: number, cambios: Partial<FilaEditable>) {
    setFilasEditables((prev) => prev.map((f, i) => (i === indice ? { ...f, ...cambios } : f)));
  }

  function anadirFila() {
    setFilasEditables((prev) => [...prev, { desdeEuros: "", hastaEuros: "", porcentaje: "" }]);
  }

  function quitarFila(indice: number) {
    setFilasEditables((prev) => prev.filter((_, i) => i !== indice));
  }

  async function guardarTramos() {
    const tramosConvertidos: TramoComision[] = filasEditables.map((f) => ({
      desdeCentimos: eurosACentimos(f.desdeEuros || "0"),
      hastaCentimos: f.hastaEuros.trim() === "" ? null : eurosACentimos(f.hastaEuros),
      porcentaje: Number(f.porcentaje.replace(",", ".")),
    }));

    const errorLocal = validarTramos(tramosConvertidos);
    if (errorLocal) {
      setErrorTramos(errorLocal);
      return;
    }

    setGuardando(true);
    setErrorTramos(null);
    try {
      const res = await fetch("/api/admin/comisiones/tramos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tramos: tramosConvertidos }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorTramos(json.error || "No se pudieron guardar los tramos.");
        return;
      }
      setTramos(json.tramos ?? []);
      setEditando(false);
      setAvisoGuardado(true);
      // Los cambios afectan al cálculo del mes que se esté viendo ahora
      // mismo, así que se vuelve a pedir para que se refleje al momento.
      refrescarDatos();
    } finally {
      setGuardando(false);
    }
  }

  function refrescarDatos() {
    setCargandoDatos(true);
    fetch(`/api/admin/comisiones?mes=${mes}`)
      .then((r) => r.json())
      .then((json) => setDatos(json))
      .finally(() => setCargandoDatos(false));
  }

  function empezarEdicionPct() {
    setPctEditable(String(datos?.porcentajeProductos ?? 15));
    setErrorPct(null);
    setEditandoPct(true);
  }

  async function guardarPct() {
    const porcentaje = Number(pctEditable.replace(",", "."));
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      setErrorPct("El porcentaje debe estar entre 0 y 100.");
      return;
    }
    setGuardandoPct(true);
    setErrorPct(null);
    try {
      const res = await fetch("/api/admin/comisiones/config-productos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ porcentaje }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorPct(json.error || "No se pudo guardar.");
        return;
      }
      setEditandoPct(false);
      refrescarDatos();
    } finally {
      setGuardandoPct(false);
    }
  }

  const esMesActual = mes === mesActualStr();
  const propia = rol !== "admin" ? datos?.filas[0] : undefined;

  return (
    <div className="space-y-5">
      {/* --- Selector de mes --- */}
      <div className="flex items-center justify-center gap-3 rounded-lg border border-stone-200 bg-white p-3 sm:justify-start">
        <button
          onClick={() => setMes((m) => sumarMeses(m, -1))}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400"
          aria-label="Mes anterior"
        >
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
        {!esMesActual && (
          <button onClick={() => setMes(mesActualStr())} className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark">
            Ir al mes actual
          </button>
        )}
      </div>

      {cargandoDatos && !datos ? (
        <p className="text-sm text-stone-500">Calculando…</p>
      ) : rol === "admin" ? (
        <>
          {/* --- Vista de administrador: todo el equipo --- */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Facturación del equipo</div>
              <div className="mt-1 text-2xl font-bold text-stone-900">{euros(datos?.totalFacturacionCentimos ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Comisiones a pagar (servicios)</div>
              <div className="mt-1 text-2xl font-bold text-stone-900">{euros(datos?.totalComisionCentimos ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Venta de productos</div>
              <div className="mt-1 text-2xl font-bold text-stone-900">{euros(datos?.totalProductosCentimos ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-stone-500">Comisión por productos</div>
              <div className="mt-1 text-2xl font-bold text-stone-900">{euros(datos?.totalComisionProductosCentimos ?? 0)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs uppercase tracking-wider text-stone-500">Comisión por barbero — {etiquetaMes(mes)}</h3>
              <button
                onClick={() =>
                  descargarCSV(
                    `comisiones-${mes}`,
                    (datos?.filas ?? []).map((f) => ({
                      barbero: f.nombre,
                      citas: f.citasCompletadas,
                      facturacion_euros: (f.facturacionCentimos / 100).toFixed(2),
                      porcentaje: f.tramo?.porcentaje ?? 0,
                      comision_euros: (f.comisionCentimos / 100).toFixed(2),
                      productos_euros: (f.productosCentimos / 100).toFixed(2),
                      comision_productos_euros: (f.comisionProductosCentimos / 100).toFixed(2),
                    }))
                  )
                }
                disabled={(datos?.filas.length ?? 0) === 0}
                className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark disabled:opacity-40 disabled:no-underline"
              >
                Exportar CSV
              </button>
            </div>
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
                      <th className="py-2 pr-3 font-mono font-normal">Productos</th>
                      <th className="py-2 pr-3 font-mono font-normal">Com. productos</th>
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
                        <td className="py-2 pr-3 font-mono text-stone-500">{euros(f.productosCentimos)}</td>
                        <td className="py-2 pr-3 font-mono font-semibold text-stone-900">{euros(f.comisionProductosCentimos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* --- Vista de barbero: meta, KPIs, ranking, recorrido y simulador --- */
        <VistaBarbero fila={propia} tramos={tramos ?? []} mes={mes} esMesActual={esMesActual} porcentajeProductos={datos?.porcentajeProductos ?? 0} />
      )}

      {/* --- Tramos de comisión: tabla de referencia para todos, editable solo para admin --- */}
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-stone-500">Tramos de comisión</h3>
          {rol === "admin" && !editando && (
            <button onClick={empezarEdicion} className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark">
              Editar tramos
            </button>
          )}
        </div>

        {!editando ? (
          <>
            {avisoGuardado && <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">Tramos guardados.</p>}
            {tramos === null ? (
              <p className="text-sm text-stone-500">Cargando…</p>
            ) : tramos.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-400">No hay ningún tramo definido: nadie cobra comisión.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {tramos.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5">
                    <span className="text-stone-700">
                      {euros(t.desdeCentimos)} – {t.hastaCentimos === null ? "sin límite" : euros(t.hastaCentimos)}
                    </span>
                    <span className="font-mono font-semibold text-stone-900">{t.porcentaje}%</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-stone-500">
              El porcentaje se aplica a TODA la facturación del mes, según en qué tramo caiga el total (no es progresivo). Deja el
              campo &quot;hasta&quot; vacío en el tramo más alto para que no tenga límite superior.
            </p>
            <div className="space-y-2">
              {filasEditables.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-stone-500">Desde</span>
                  <input
                    type="number"
                    step="0.01"
                    value={f.desdeEuros}
                    onChange={(e) => actualizarFila(i, { desdeEuros: e.target.value })}
                    className="w-28 rounded-lg border border-stone-300 p-1.5 text-sm"
                    placeholder="€"
                  />
                  <span className="text-sm text-stone-500">hasta</span>
                  <input
                    type="number"
                    step="0.01"
                    value={f.hastaEuros}
                    onChange={(e) => actualizarFila(i, { hastaEuros: e.target.value })}
                    className="w-28 rounded-lg border border-stone-300 p-1.5 text-sm"
                    placeholder="sin límite"
                  />
                  <span className="text-sm text-stone-500">€ →</span>
                  <input
                    type="number"
                    step="0.01"
                    value={f.porcentaje}
                    onChange={(e) => actualizarFila(i, { porcentaje: e.target.value })}
                    className="w-20 rounded-lg border border-stone-300 p-1.5 text-sm"
                    placeholder="%"
                  />
                  <span className="text-sm text-stone-500">%</span>
                  <button onClick={() => quitarFila(i)} className="ml-1 text-stone-400 hover:text-red-500" aria-label="Quitar tramo">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button onClick={anadirFila} className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark">
              + Añadir tramo
            </button>

            {errorTramos && <p className="text-sm text-red-500">{errorTramos}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={guardarTramos}
                disabled={guardando}
                className="rounded-full bg-brand-yellow px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
              <button onClick={cancelarEdicion} disabled={guardando} className="rounded-full border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:border-stone-400">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Comisión por productos: un único porcentaje plano, sin tramos --- */}
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wider text-stone-500">Comisión por productos</h3>
          {rol === "admin" && !editandoPct && (
            <button onClick={empezarEdicionPct} className="font-mono text-[11px] uppercase tracking-wider text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-yellow-dark">
              Editar porcentaje
            </button>
          )}
        </div>
        {!editandoPct ? (
          <p className="text-sm text-stone-700">
            Un único <span className="font-mono font-semibold text-stone-900">{datos?.porcentajeProductos ?? 0}%</span> sobre
            todo lo vendido en productos ese mes — sin tramos, desde el primer euro. No cuenta para el ranking, que sigue siendo
            solo por facturación de servicios. Se venden solo en persona: el barbero los añade al marcar una cita como
            completada — el catálogo se edita en{" "}
            <a href="/admin/productos" className="underline">
              Productos
            </a>
            .
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={pctEditable}
                onChange={(e) => setPctEditable(e.target.value)}
                className="w-24 rounded-lg border border-stone-300 p-1.5 text-sm"
              />
              <span className="text-sm text-stone-500">%</span>
            </div>
            {errorPct && <p className="text-sm text-red-500">{errorPct}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={guardarPct}
                disabled={guardandoPct}
                className="rounded-full bg-brand-yellow px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
              >
                {guardandoPct ? "Guardando…" : "Guardar"}
              </button>
              <button onClick={() => setEditandoPct(false)} disabled={guardandoPct} className="rounded-full border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:border-stone-400">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

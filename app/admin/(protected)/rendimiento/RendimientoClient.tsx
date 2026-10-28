"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  OBJETIVO_MENSUAL_CENTIMOS,
  ORDEN_DIAS,
  euros,
  horarioActual,
  simularEscenario,
  type AnalisisRendimiento,
  type ResultadoEscenario,
} from "@/lib/rendimiento";

const horas = (min: number) => `${Math.round(min / 60)} h`;
const pctTxt = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-ES")} %`);
const eurHora = (v: number | null) => (v === null ? "—" : `${(v / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €/h`);

// Color de una celda según su ocupación (0–1).
function colorOcupacion(o: number | null): string {
  if (o === null) return "bg-stone-50";
  if (o < 0.2) return "bg-red-200";
  if (o < 0.35) return "bg-orange-200";
  if (o < 0.6) return "bg-yellow-100";
  if (o < 0.85) return "bg-emerald-200";
  return "bg-emerald-500 text-white";
}

export default function RendimientoClient() {
  const [semanas, setSemanas] = useState(6);
  const [datos, setDatos] = useState<AnalisisRendimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    fetch(`/api/admin/rendimiento?semanas=${semanas}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Error");
        if (!cancelado) setDatos(json);
      })
      .catch((e) => !cancelado && setError(e.message || "No se pudieron cargar los datos."))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [semanas]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-stone-600">
          Analizar las últimas{" "}
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className="rounded border border-stone-300 px-2 py-1">
            {[4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} semanas
              </option>
            ))}
          </select>
        </label>
        {datos && (
          <span className="text-xs text-stone-400">
            Del {datos.desde.split("-").reverse().join("/")} al {datos.hasta.split("-").reverse().join("/")}
          </span>
        )}
      </div>

      {cargando && <p className="text-sm text-stone-500">Analizando agenda, horarios y cobros…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {datos && !cargando && (
        <>
          <TablaEquipo datos={datos} />
          <Alertas datos={datos} />
          <MapasSede datos={datos} />
          <Simulador datos={datos} />
        </>
      )}
    </div>
  );
}

function Seccion({ titulo, explicacion, children }: { titulo: string; explicacion?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-stone-500">{titulo}</h2>
      {explicacion && <p className="mt-1 text-xs text-stone-400">{explicacion}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TablaEquipo({ datos }: { datos: AnalisisRendimiento }) {
  const filas = [...datos.barberos].sort((a, b) => b.proyeccionMensualCentimos - a.proyeccionMensualCentimos);
  return (
    <Seccion
      titulo="Equipo"
      explicacion={`Facturación del periodo (mismo cálculo que Comisiones) y proyección a un mes. Horas trabajadas = turno menos descansos, ausencias y vacaciones. Objetivo: ${euros(OBJETIVO_MENSUAL_CENTIMOS)} al mes.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
              <th className="py-2 pr-3">Barbero</th>
              <th className="py-2 pr-3 text-right">Facturación</th>
              <th className="py-2 pr-3 text-right">Al mes</th>
              <th className="py-2 pr-3">Hacia 4.000 €</th>
              <th className="py-2 pr-3 text-right">Trabajadas</th>
              <th className="py-2 pr-3 text-right">Con clientes</th>
              <th className="py-2 pr-3 text-right">Libres</th>
              <th className="py-2 pr-3 text-right">Ocupación</th>
              <th className="py-2 pr-3 text-right">€ / hora</th>
              <th className="py-2 pr-3 text-right">Ticket medio</th>
              <th className="py-2 text-right">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((b) => {
              const progreso = Math.min(100, Math.round((b.proyeccionMensualCentimos / OBJETIVO_MENSUAL_CENTIMOS) * 100));
              return (
                <tr key={b.profesionalId} className="border-b border-stone-100">
                  <td className="py-2 pr-3 font-semibold text-stone-900">{b.nombre}</td>
                  <td className="py-2 pr-3 text-right">{euros(b.facturacionCentimos)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{euros(b.proyeccionMensualCentimos)}</td>
                  <td className="py-2 pr-3">
                    <div className="h-2 w-28 overflow-hidden rounded bg-stone-100">
                      <div className={"h-full " + (progreso >= 100 ? "bg-emerald-500" : "bg-brand-yellow")} style={{ width: `${progreso}%` }} />
                    </div>
                    <span className="text-[11px] text-stone-400">{progreso} %</span>
                  </td>
                  <td className="py-2 pr-3 text-right">{horas(b.disponibleMin)}</td>
                  <td className="py-2 pr-3 text-right">{horas(b.ocupadoMin)}</td>
                  <td className="py-2 pr-3 text-right">{horas(b.libreMin)}</td>
                  <td className="py-2 pr-3 text-right">{pctTxt(b.ocupacionPct)}</td>
                  <td className="py-2 pr-3 text-right">{eurHora(b.productividadCentimosHora)}</td>
                  <td className="py-2 pr-3 text-right">{b.ticketMedioCentimos === null ? "—" : euros(b.ticketMedioCentimos)}</td>
                  <td className="py-2 text-right">{b.clientes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

function Alertas({ datos }: { datos: AnalisisRendimiento }) {
  const [verTodas, setVerTodas] = useState(false);
  const lista = verTodas ? datos.alertas : datos.alertas.slice(0, 8);
  const etiqueta: Record<string, string> = {
    ocupacion_baja: "Poca demanda",
    falta_personal: "Faltan barberos",
    sobra_personal: "Sobran barberos",
    productividad_baja: "Productividad",
    huecos: "Huecos",
    objetivo: "Objetivo",
  };
  return (
    <Seccion titulo="Oportunidades detectadas" explicacion="Son avisos para estudiar, no cambios: ningún horario se modifica solo.">
      {datos.alertas.length === 0 ? (
        <p className="text-sm text-stone-500">No hay nada destacable en este periodo.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((a, i) => (
            <li key={i} className="flex gap-3 rounded border border-stone-100 p-2 text-sm">
              <span
                className={
                  "h-fit shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " +
                  (a.prioridad === 1 ? "bg-red-100 text-red-700" : a.prioridad === 2 ? "bg-orange-100 text-orange-700" : "bg-stone-100 text-stone-600")
                }
              >
                {etiqueta[a.tipo]}
              </span>
              <span className="text-stone-700">{a.texto}</span>
            </li>
          ))}
        </ul>
      )}
      {datos.alertas.length > 8 && (
        <button onClick={() => setVerTodas(!verTodas)} className="mt-2 text-xs text-stone-500 underline">
          {verTodas ? "Ver menos" : `Ver las ${datos.alertas.length}`}
        </button>
      )}
    </Seccion>
  );
}

// Horas que tienen algún turno en alguna sede, para no pintar la madrugada.
function rangoHoras(datos: AnalisisRendimiento): number[] {
  let min = 24;
  let max = 0;
  for (const b of datos.barberos)
    for (let d = 0; d < 7; d++)
      for (let h = 0; h < 24; h++)
        if (b.rejilla[d][h].semanasConTurno > 0 || b.rejilla[d][h].ingresoCentimos > 0) {
          min = Math.min(min, h);
          max = Math.max(max, h);
        }
  if (min > max) return Array.from({ length: 13 }, (_, i) => 9 + i);
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function Leyenda() {
  const items: [string, string][] = [
    ["bg-red-200", "< 20 %"],
    ["bg-orange-200", "20–35 %"],
    ["bg-yellow-100", "35–60 %"],
    ["bg-emerald-200", "60–85 %"],
    ["bg-emerald-500", "> 85 %"],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-stone-500">
      {items.map(([c, t]) => (
        <span key={t} className="flex items-center gap-1">
          <span className={"inline-block h-3 w-3 rounded-sm " + c} /> {t}
        </span>
      ))}
    </div>
  );
}

function MapasSede({ datos }: { datos: AnalisisRendimiento }) {
  const listaHoras = rangoHoras(datos);
  const [sedeId, setSedeId] = useState(datos.sedes[0]?.sedeId ?? "");
  const sede = datos.sedes.find((s) => s.sedeId === sedeId);
  if (!sede) return null;
  return (
    <Seccion
      titulo="Ocupación por día y hora"
      explicacion="Cada casilla: ocupación de la sede en esa hora (citas cobradas / horas disponibles) y, debajo, cuántos barberos hay de media."
    >
      <div className="mb-3 flex gap-2">
        {datos.sedes.map((s) => (
          <button
            key={s.sedeId}
            onClick={() => setSedeId(s.sedeId)}
            className={"rounded-full px-3 py-1 text-xs " + (s.sedeId === sedeId ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600")}
          >
            {s.nombre}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th />
              {listaHoras.map((h) => (
                <th key={h} className="px-1 font-normal text-stone-400">
                  {h}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDEN_DIAS.map((d) => (
              <tr key={d}>
                <td className="pr-2 text-stone-500">{DIAS_CORTOS[d]}</td>
                {listaHoras.map((h) => {
                  const c = sede.rejilla[d][h];
                  const o = c.disponibleMin > 0 ? c.ocupadoMin / c.disponibleMin : null;
                  return (
                    <td key={h} title={o === null ? "Sin turno" : `${Math.round(o * 100)} % · ${c.barberosMedios} barberos`} className={"h-9 w-10 rounded text-center leading-tight " + colorOcupacion(o)}>
                      {o !== null && (
                        <>
                          <div className="font-semibold">{Math.round(o * 100)}</div>
                          <div className="opacity-60">{c.barberosMedios}</div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Leyenda />
    </Seccion>
  );
}

function Simulador({ datos }: { datos: AnalisisRendimiento }) {
  const listaHoras = rangoHoras(datos);
  const [barberoId, setBarberoId] = useState(datos.barberos[0]?.profesionalId ?? "");
  const barbero = datos.barberos.find((b) => b.profesionalId === barberoId) ?? null;
  const [propuesta, setPropuesta] = useState<boolean[][] | null>(null);
  const [retencion, setRetencion] = useState(60);

  useEffect(() => {
    setPropuesta(barbero ? horarioActual(barbero) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberoId]);

  // Su sede principal (la de más horas) para estimar las horas nuevas.
  const sede = useMemo(() => {
    if (!barbero) return null;
    return datos.sedes.find((s) => s.sedeId === barbero.sedeIds[0]) ?? datos.sedes[0] ?? null;
  }, [barbero, datos.sedes]);

  const actual = useMemo(
    () => (barbero ? simularEscenario(barbero, sede, horarioActual(barbero), datos.semanas, retencion / 100) : null),
    [barbero, sede, datos.semanas, retencion],
  );
  const propuesto = useMemo(
    () => (barbero && propuesta ? simularEscenario(barbero, sede, propuesta, datos.semanas, retencion / 100) : null),
    [barbero, sede, propuesta, datos.semanas, retencion],
  );

  if (!barbero || !propuesta) return null;
  const base = horarioActual(barbero);

  function alternar(d: number, h: number) {
    setPropuesta((p) => p && p.map((fila, i) => (i === d ? fila.map((v, j) => (j === h ? !v : v)) : fila)));
  }

  return (
    <Seccion
      titulo="Simulador de horarios"
      explicacion="Toca las horas para quitarlas o añadirlas y compara con el horario actual. Es una estimación con los datos de estas semanas, no una promesa de facturación, y no cambia el horario real: cualquier cambio lo decides tú respetando contratos, descansos y la ley."
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select value={barberoId} onChange={(e) => setBarberoId(e.target.value)} className="rounded border border-stone-300 px-2 py-1 text-sm">
          {datos.barberos.map((b) => (
            <option key={b.profesionalId} value={b.profesionalId}>
              {b.nombre}
            </option>
          ))}
        </select>
        <button onClick={() => setPropuesta(horarioActual(barbero))} className="text-xs text-stone-500 underline">
          Volver al horario actual
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th />
              {listaHoras.map((h) => (
                <th key={h} className="px-1 font-normal text-stone-400">
                  {h}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDEN_DIAS.map((d) => (
              <tr key={d}>
                <td className="pr-2 text-stone-500">{DIAS_CORTOS[d]}</td>
                {listaHoras.map((h) => {
                  const c = barbero.rejilla[d][h];
                  const o = c.disponibleMin > 0 ? c.ocupadoMin / c.disponibleMin : null;
                  const trabaja = propuesta[d][h];
                  const cambio = trabaja !== base[d][h];
                  return (
                    <td key={h} className="p-0">
                      <button
                        onClick={() => alternar(d, h)}
                        title={`${DIAS_SEMANA[d]} ${h}:00 · ${o === null ? "sin turno ahora" : `ocupación ${Math.round(o * 100)} %`}`}
                        className={
                          "h-9 w-10 rounded text-center leading-tight " +
                          (trabaja ? colorOcupacion(o) : "bg-white text-stone-300") +
                          (cambio ? " ring-2 ring-stone-900" : " ring-1 ring-stone-200")
                        }
                      >
                        {trabaja ? (o === null ? "+" : Math.round(o * 100)) : "–"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Leyenda />
      <p className="mt-1 text-[11px] text-stone-400">Recuadro negro = hora cambiada. "+" = hora nueva (se estima con la ocupación de la sede a esa hora).</p>

      <label className="mt-4 block text-xs text-stone-600">
        Clientes de las horas quitadas que se recolocan en otras horas suyas: <b>{retencion} %</b>
        <input type="range" min={0} max={100} step={5} value={retencion} onChange={(e) => setRetencion(Number(e.target.value))} className="ml-2 align-middle" />
      </label>

      {actual && propuesto && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TarjetaEscenario titulo="Horario actual" r={actual} />
          <TarjetaEscenario titulo="Horario propuesto (estimación)" r={propuesto} comparar={actual} />
        </div>
      )}
    </Seccion>
  );
}

function TarjetaEscenario({ titulo, r, comparar }: { titulo: string; r: ResultadoEscenario; comparar?: ResultadoEscenario }) {
  function dif(a: number | null, b: number | null | undefined, formato: (n: number) => string) {
    if (!comparar || a === null || b === null || b === undefined) return null;
    const d = a - b;
    if (Math.abs(d) < 0.5) return <span className="text-stone-400"> (=)</span>;
    return <span className={d > 0 ? "text-emerald-600" : "text-red-600"}> ({d > 0 ? "+" : "−"}{formato(Math.abs(d))})</span>;
  }
  const llega = r.facturacionMensualCentimos >= OBJETIVO_MENSUAL_CENTIMOS;
  return (
    <div className={"rounded-lg border p-4 " + (comparar ? "border-stone-900" : "border-stone-200")}>
      <div className="font-mono text-xs uppercase tracking-wider text-stone-500">{titulo}</div>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">Horas al mes</dt>
          <dd className="font-semibold">{r.horasMensuales} h{dif(r.horasMensuales, comparar?.horasMensuales, (n) => `${Math.round(n)} h`)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Facturación al mes</dt>
          <dd className="font-semibold">
            {euros(r.facturacionMensualCentimos)}
            {dif(r.facturacionMensualCentimos, comparar?.facturacionMensualCentimos, (n) => euros(n))}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Ocupación</dt>
          <dd className="font-semibold">{pctTxt(r.ocupacionPct)}{dif(r.ocupacionPct, comparar?.ocupacionPct, (n) => `${n.toFixed(1)} pts`)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Productividad</dt>
          <dd className="font-semibold">
            {eurHora(r.productividadCentimosHora)}
            {dif(r.productividadCentimosHora, comparar?.productividadCentimosHora, (n) => eurHora(n))}
          </dd>
        </div>
      </dl>
      <p className={"mt-2 text-xs " + (llega ? "text-emerald-600" : "text-stone-400")}>
        {llega ? "Llegaría a los 4.000 € al mes." : `Le faltarían unos ${euros(OBJETIVO_MENSUAL_CENTIMOS - r.facturacionMensualCentimos)} para los 4.000 €.`}
      </p>
    </div>
  );
}


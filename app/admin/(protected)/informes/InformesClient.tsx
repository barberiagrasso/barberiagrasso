"use client";

import { useEffect, useState } from "react";

interface Sede {
  id: string;
  nombre: string;
}

interface Informe {
  ingresosPorBarbero: { nombre: string; ingresosCentimos: number }[];
  ingresosTotalCentimos: number;
  serviciosMasPedidos: { nombre: string; cantidad: number; ingresosCentimos: number }[];
  ocupacionPorHora: { hora: number; ocupadas: number; capacidad: number }[];
  ocupacionLimitada: boolean;
  citasCompletadasCount: number;
}

function euros(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
}

function hace30Dias() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function InformesClient({ sedes }: { sedes: Sede[] }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [desde, setDesde] = useState(hace30Dias());
  const [hasta, setHasta] = useState(hoyISO());
  const [informe, setInforme] = useState<Informe | null>(null);
  const [ingresosPorSede, setIngresosPorSede] = useState<{ nombre: string; ingresosCentimos: number }[]>([]);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    if (!sedeId) return;
    setCargando(true);
    const [propio, ...otros] = await Promise.all(
      sedes.map((s) =>
        fetch(`/api/admin/informes?sedeId=${s.id}&desde=${desde}&hasta=${hasta}`).then((r) => r.json())
      )
    );
    const indicePropio = sedes.findIndex((s) => s.id === sedeId);
    setInforme(indicePropio === 0 ? propio : otros[indicePropio - 1]);
    const todos = [propio, ...otros];
    setIngresosPorSede(sedes.map((s, i) => ({ nombre: s.nombre, ingresosCentimos: todos[i]?.ingresosTotalCentimos ?? 0 })));
    setCargando(false);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId, desde, hasta]);

  const capacidadMaxima = Math.max(1, ...(informe?.ocupacionPorHora.map((h) => h.capacidad) ?? [1]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {sedes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSedeId(s.id)}
              className={
                "rounded-lg border px-3 py-2 text-sm " +
                (sedeId === s.id ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink" : "border-stone-200")
              }
            >
              {s.nombre}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-stone-300 p-2 text-sm" />
          <span>hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-stone-300 p-2 text-sm" />
        </div>
      </div>

      {cargando && <p className="text-sm text-stone-500">Calculando…</p>}

      {informe && !cargando && (
        <>
          <section>
            <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Ingresos por sede</h2>
            <div className="flex gap-6 rounded-lg border border-stone-200 bg-white p-4">
              {ingresosPorSede.map((s) => (
                <div key={s.nombre}>
                  <div className="text-2xl font-bold text-stone-900">{euros(s.ingresosCentimos)}</div>
                  <div className="text-sm text-stone-500">{s.nombre}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">
              Ingresos por barbero — {sedes.find((s) => s.id === sedeId)?.nombre} ({informe.citasCompletadasCount} citas completadas)
            </h2>
            <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
              {informe.ingresosPorBarbero.map((b) => (
                <div key={b.nombre} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-stone-800">{b.nombre}</span>
                  <span className="font-mono text-stone-900">{euros(b.ingresosCentimos)}</span>
                </div>
              ))}
              {informe.ingresosPorBarbero.length === 0 && <p className="p-3 text-sm text-stone-400">Sin citas completadas en este rango.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Servicios y complementos más pedidos</h2>
            <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
              {informe.serviciosMasPedidos.slice(0, 15).map((s) => (
                <div key={s.nombre} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-stone-800">{s.nombre}</span>
                  <span className="text-stone-500">
                    {s.cantidad} veces · <span className="font-mono text-stone-900">{euros(s.ingresosCentimos)}</span>
                  </span>
                </div>
              ))}
              {informe.serviciosMasPedidos.length === 0 && <p className="p-3 text-sm text-stone-400">Sin datos en este rango.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Ocupación por franja horaria</h2>
            <p className="mb-2 text-xs text-stone-400">
              Cálculo aproximado a partir del horario semanal y las vacaciones/bloqueos: compara cuántas citas
              empezaron en cada hora con cuántos huecos de barbero había disponibles en total en ese rango.
            </p>
            {informe.ocupacionLimitada ? (
              <p className="text-sm text-amber-700">El rango es muy largo (más de 3 meses); acórtalo para ver la ocupación por hora.</p>
            ) : (
              <div className="space-y-1 rounded-lg border border-stone-200 bg-white p-4">
                {informe.ocupacionPorHora.map((h) => {
                  const pct = h.capacidad > 0 ? Math.min(100, Math.round((h.ocupadas / h.capacidad) * 100)) : 0;
                  return (
                    <div key={h.hora} className="flex items-center gap-2 text-sm">
                      <span className="w-12 font-mono text-stone-500">{String(h.hora).padStart(2, "0")}:00</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
                        <div
                          className="h-4 rounded bg-brand-yellow"
                          style={{ width: `${(h.capacidad / capacidadMaxima) * 100}%`, opacity: h.capacidad > 0 ? 1 : 0 }}
                        >
                          <div className="h-4 rounded bg-brand-yellow-dark" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="w-24 text-right text-stone-500">
                        {h.ocupadas}/{h.capacidad} ({pct}%)
                      </span>
                    </div>
                  );
                })}
                {informe.ocupacionPorHora.length === 0 && <p className="text-sm text-stone-400">Sin horario configurado para esta sede.</p>}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { mesActualStr, sumarMeses, etiquetaMes } from "@/lib/comisiones";

interface FilaComision {
  profesionalId: string;
  facturacionCentimos: number;
  citasCompletadas: number;
  comisionCentimos: number;
  comisionProductosCentimos: number;
  tramo: { porcentaje: number } | null;
}

interface Persona {
  profesionalId: string;
  nombre: string;
  fotoUrl: string | null;
  sueldoBaseCentimos: number;
  metaMensualCentimos: number;
  notas?: string;
  opiniones: { valoraciones: number; media: number | null; comentarios: { estrellas: number; texto: string | null }[] };
}

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const aCentimos = (s: string) => {
  const n = Math.round(parseFloat(s.replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function PersonalClient({ esAdmin }: { esAdmin: boolean }) {
  const [mes, setMes] = useState(mesActualStr());
  const [personal, setPersonal] = useState<Persona[] | null>(null);
  const [comisiones, setComisiones] = useState<FilaComision[]>([]);
  const [faltaSql, setFaltaSql] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { sueldo: string; meta: string; notas: string }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const [a, b] = await Promise.all([
      fetch(`/api/admin/personal?mes=${mes}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/admin/comisiones?mes=${mes}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (a.error) return setError(a.error);
    setPersonal(a.personal);
    setFaltaSql(a.faltaSql);
    setComisiones(b.filas ?? []);
  }, [mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(p: Persona) {
    const e = edit[p.profesionalId];
    const sueldo = aCentimos(e?.sueldo ?? String(p.sueldoBaseCentimos / 100));
    const meta = aCentimos(e?.meta ?? String(p.metaMensualCentimos / 100));
    if (sueldo === null || meta === null) return setError("Revisa las cantidades.");
    setGuardando(p.profesionalId);
    const res = await fetch("/api/admin/personal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profesionalId: p.profesionalId, sueldoBaseCentimos: sueldo, metaMensualCentimos: meta, notas: e?.notas ?? p.notas ?? "" }),
    });
    const d = await res.json();
    setGuardando(null);
    if (!res.ok) return setError(d.error ?? "No se pudo guardar.");
    setEdit((x) => {
      const n = { ...x };
      delete n[p.profesionalId];
      return n;
    });
    await cargar();
  }

  if (error && !personal) return <p className="text-sm text-red-700">{error}</p>;
  if (!personal) return <p className="text-sm text-stone-500">Cargando…</p>;

  const esMesActual = mes === mesActualStr();
  const total = personal.reduce((acc, p) => {
    const c = comisiones.find((f) => f.profesionalId === p.profesionalId);
    return acc + p.sueldoBaseCentimos + (c ? c.comisionCentimos + c.comisionProductosCentimos : 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={() => setMes(sumarMeses(mes, -1))} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm">←</button>
        <span className="min-w-[10rem] text-center font-semibold capitalize text-stone-900">{etiquetaMes(mes)}</span>
        <button onClick={() => setMes(sumarMeses(mes, 1))} disabled={esMesActual} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40">→</button>
        <button onClick={() => window.print()} className="ml-auto rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Imprimir</button>
      </div>

      {faltaSql && esAdmin && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Falta ejecutar <code>supabase/anadir-personal.sql</code> para guardar sueldos, metas y notas.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">{error}</p>}

      {esAdmin && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          Total a pagar este mes (sueldos + comisiones): <b className="text-lg text-stone-900">{euros(total)}</b>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {personal.map((p) => {
          const c = comisiones.find((f) => f.profesionalId === p.profesionalId);
          const fact = c?.facturacionCentimos ?? 0;
          const comision = (c?.comisionCentimos ?? 0) + (c?.comisionProductosCentimos ?? 0);
          const pct = Math.min(100, Math.round((fact / Math.max(1, p.metaMensualCentimos)) * 100));
          const e = edit[p.profesionalId];
          return (
            <section key={p.profesionalId} className="break-inside-avoid rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-3">
                {p.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.fotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-200 font-bold text-stone-600">{p.nombre[0]}</div>
                )}
                <div>
                  <p className="font-semibold text-stone-900">{p.nombre}</p>
                  <p className="text-xs text-stone-500">{c?.citasCompletadas ?? 0} citas · {c?.tramo ? `tramo ${c.tramo.porcentaje}%` : "sin tramo"}</p>
                </div>
              </div>

              <div className="mb-1 flex justify-between text-sm">
                <span className="text-stone-600">Facturado</span>
                <b>{euros(fact)}</b>
              </div>
              <div className="mb-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mb-3 text-xs text-stone-500">
                {pct}% de la meta de {euros(p.metaMensualCentimos)}
              </p>

              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-stone-600">Comisión</dt><dd className="text-right">{euros(comision)}</dd>
                <dt className="text-stone-600">Sueldo base</dt><dd className="text-right">{euros(p.sueldoBaseCentimos)}</dd>
                <dt className="font-semibold">Total del mes</dt><dd className="text-right font-semibold">{euros(p.sueldoBaseCentimos + comision)}</dd>
              </dl>

              <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">
                <p className="mb-1 font-semibold text-stone-800">
                  Opiniones del mes {p.opiniones.media !== null ? `· ★ ${p.opiniones.media} (${p.opiniones.valoraciones})` : "· sin valoraciones"}
                </p>
                {p.opiniones.comentarios.length === 0 ? (
                  <p className="text-stone-500">Todavía no hay comentarios.</p>
                ) : (
                  <ul className="space-y-1">
                    {p.opiniones.comentarios.map((o, i) => (
                      <li key={i} className="text-stone-700">★ {o.estrellas} · “{o.texto}”</li>
                    ))}
                  </ul>
                )}
              </div>

              {esAdmin && (
                <div className="mt-3 space-y-2 border-t pt-3 text-sm print:hidden">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-stone-600">
                      Sueldo base (€)
                      <input inputMode="decimal" value={e?.sueldo ?? String(p.sueldoBaseCentimos / 100)} onChange={(ev) => setEdit((x) => ({ ...x, [p.profesionalId]: { sueldo: ev.target.value, meta: x[p.profesionalId]?.meta ?? String(p.metaMensualCentimos / 100), notas: x[p.profesionalId]?.notas ?? p.notas ?? "" } }))} className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5" />
                    </label>
                    <label className="text-stone-600">
                      Meta mensual (€)
                      <input inputMode="decimal" value={e?.meta ?? String(p.metaMensualCentimos / 100)} onChange={(ev) => setEdit((x) => ({ ...x, [p.profesionalId]: { meta: ev.target.value, sueldo: x[p.profesionalId]?.sueldo ?? String(p.sueldoBaseCentimos / 100), notas: x[p.profesionalId]?.notas ?? p.notas ?? "" } }))} className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5" />
                    </label>
                  </div>
                  <label className="block text-stone-600">
                    Notas
                    <input value={e?.notas ?? p.notas ?? ""} onChange={(ev) => setEdit((x) => ({ ...x, [p.profesionalId]: { notas: ev.target.value, sueldo: x[p.profesionalId]?.sueldo ?? String(p.sueldoBaseCentimos / 100), meta: x[p.profesionalId]?.meta ?? String(p.metaMensualCentimos / 100) } }))} className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5" />
                  </label>
                  <button disabled={!e || guardando === p.profesionalId} onClick={() => void guardar(p)} className="w-full rounded-lg bg-stone-900 px-3 py-2 font-semibold text-white disabled:opacity-40">
                    {guardando === p.profesionalId ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

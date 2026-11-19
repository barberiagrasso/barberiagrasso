"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Fila {
  id: string;
  fecha: string;
  abierta_at: string | null;
  abierta_por_nombre: string | null;
  fondo_inicial_centimos: number | null;
  cerrada_at: string | null;
  cerrada_por_nombre: string | null;
  efectivo_cobrado_centimos: number | null;
  tarjeta_centimos: number | null;
  bizum_centimos: number | null;
  otros_centimos: number | null;
  num_cobros: number | null;
  efectivo_esperado_centimos: number | null;
  efectivo_contado_centimos: number | null;
  diferencia_centimos: number | null;
  motivo_diferencia: string | null;
  fondo_siguiente_centimos: number | null;
}

interface Datos {
  faltaSql: boolean;
  esAdmin: boolean;
  hoy: string;
  fecha: string;
  sedes: { id: string; nombre: string; encargadoId: string | null; puedeCerrar: boolean }[];
  sedeId: string;
  fila: Fila | null;
  fotoUrl: string | null;
  pendientes: { id: string; hora: string; cliente: string; barbero: string }[];
  cobros: { efectivo: number; tarjeta: number; bizum: number; otros: number; numCobros: number };
  sinCerrar: string[];
  fondoAnterior: number | null;
  historial: Fila[];
  cuentas: { id: string; nombre: string | null; rol: string }[];
}

const euros = (c: number | null | undefined) =>
  ((c ?? 0) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const aCentimos = (s: string) => {
  const n = Math.round(parseFloat(s.replace(",", ".")) * 100);
  return Number.isFinite(n) ? n : null;
};
const fechaBonita = (f: string) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "";

export default function CajaClient() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [sedeId, setSedeId] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState("");
  const [fondoSig, setFondoSig] = useState("");
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async (s?: string, f?: string) => {
    const qs = new URLSearchParams();
    if (s) qs.set("sede", s);
    if (f) qs.set("fecha", f);
    const res = await fetch("/api/admin/caja?" + qs.toString(), { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "No se pudo cargar la caja.");
      return;
    }
    setDatos(d);
    if (d.sedeId) setSedeId(d.sedeId);
    if (d.fecha) setFecha(d.fecha);
    setError(null);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!datos) return <p className="text-sm text-stone-500">{error ?? "Cargando…"}</p>;
  if (datos.faltaSql)
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        La caja aún no está activada: falta ejecutar <code>supabase/anadir-cierre-caja.sql</code> en Supabase.
      </p>
    );
  if (datos.sedes.length === 0)
    return <p className="text-sm text-stone-500">Tu cuenta no está asignada a ninguna sede todavía.</p>;

  const sede = datos.sedes.find((s) => s.id === datos.sedeId)!;
  const fila = datos.fila;
  const esHoy = datos.fecha === datos.hoy;
  const abierta = Boolean(fila?.abierta_at);
  const cerrada = Boolean(fila?.cerrada_at);
  const fondoInicial = fila?.fondo_inicial_centimos ?? datos.fondoAnterior ?? 0;
  const esperado = fondoInicial + datos.cobros.efectivo;
  const contadoC = aCentimos(contado);
  const diferencia = contadoC === null ? null : contadoC - esperado;
  const fondoC = aCentimos(fondo);

  async function enviar(form: FormData) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/caja", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "No se pudo guardar.");
        if (d.pendientes) await cargar(sedeId, fecha);
        return;
      }
      setFondo("");
      setContado("");
      setFondoSig("");
      setMotivo("");
      setNotas("");
      setFoto(null);
      await cargar(sedeId, fecha);
    } finally {
      setEnviando(false);
    }
  }

  function abrir() {
    const f = new FormData();
    f.set("accion", "abrir");
    f.set("sedeId", sedeId);
    f.set("fecha", datos!.fecha);
    f.set("fondo", fondo);
    void enviar(f);
  }

  function cerrar() {
    const f = new FormData();
    f.set("accion", "cerrar");
    f.set("sedeId", sedeId);
    f.set("fecha", datos!.fecha);
    f.set("contado", contado);
    f.set("fondoSiguiente", fondoSig);
    f.set("motivo", motivo);
    f.set("notas", notas);
    if (foto) f.set("foto", foto);
    void enviar(f);
  }

  async function cambiarEncargado(adminId: string) {
    await fetch("/api/admin/caja/encargado", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sedeId, adminId: adminId || null }),
    });
    await cargar(sedeId, fecha);
  }

  const caja = "rounded-2xl border border-stone-200 bg-white p-4";
  const input = "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-base";
  const boton = "w-full rounded-xl bg-stone-900 px-4 py-3 font-semibold text-white disabled:opacity-40";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {datos.sedes.map((s) => (
          <button
            key={s.id}
            onClick={() => void cargar(s.id, fecha)}
            className={"rounded-full px-4 py-2 text-sm " + (s.id === sedeId ? "bg-stone-900 text-white" : "bg-white text-stone-700 border border-stone-300")}
          >
            {s.nombre}
          </button>
        ))}
        <input
          type="date"
          value={fecha}
          max={datos.hoy}
          onChange={(e) => e.target.value && void cargar(sedeId, e.target.value)}
          className="ml-auto rounded-full border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {datos.sinCerrar.length > 0 && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Hay días sin cerrar. No se puede abrir la caja hasta cerrarlos:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {datos.sinCerrar.map((f) => (
              <button key={f} onClick={() => void cargar(sedeId, f)} className="rounded-full bg-red-600 px-3 py-1.5 text-white">
                Cerrar {fechaBonita(f)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm font-medium text-red-800">{error}</p>}

      <div className={caja}>
        <p className="text-sm capitalize text-stone-500">{fechaBonita(datos.fecha)} · {sede.nombre}</p>
        <p className="mt-1 text-lg font-bold text-stone-900">
          {cerrada ? "✅ Caja cerrada" : abierta ? "🟢 Caja abierta" : "⚪ Caja sin abrir"}
        </p>
        {abierta && (
          <p className="text-sm text-stone-600">
            Abierta por {fila!.abierta_por_nombre} a las {hora(fila!.abierta_at)} con {euros(fila!.fondo_inicial_centimos)} de fondo.
          </p>
        )}
        {cerrada && (
          <p className="text-sm text-stone-600">
            Cerrada por {fila!.cerrada_por_nombre} a las {hora(fila!.cerrada_at)}.
          </p>
        )}
      </div>

      {/* APERTURA */}
      {esHoy && !abierta && !cerrada && (
        <div className={caja}>
          <h2 className="mb-2 font-semibold text-stone-900">Abrir caja</h2>
          <label className="mb-1 block text-sm text-stone-600">Cuenta el dinero de la caja y escríbelo (fondo):</label>
          <input inputMode="decimal" placeholder="Ej. 100" value={fondo} onChange={(e) => setFondo(e.target.value)} className={input} />
          {datos.fondoAnterior !== null && fondoC !== null && fondoC !== datos.fondoAnterior && (
            <p className="mt-2 text-sm font-medium text-amber-700">
              ⚠️ Ayer se dejaron {euros(datos.fondoAnterior)} de fondo y tú cuentas {euros(fondoC)}. Revísalo antes de abrir.
            </p>
          )}
          <button disabled={enviando || fondoC === null || datos.sinCerrar.length > 0} onClick={abrir} className={boton + " mt-3"}>
            Abrir caja
          </button>
        </div>
      )}

      {/* COBROS DEL DÍA */}
      <div className={caja}>
        <h2 className="mb-2 font-semibold text-stone-900">Cobrado {esHoy ? "hoy" : "ese día"}</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["💶 Efectivo", cerrada ? fila!.efectivo_cobrado_centimos : datos.cobros.efectivo],
            ["💳 Tarjeta", cerrada ? fila!.tarjeta_centimos : datos.cobros.tarjeta],
            ["📱 Bizum", cerrada ? fila!.bizum_centimos : datos.cobros.bizum],
            ["Otros", cerrada ? fila!.otros_centimos : datos.cobros.otros],
          ].map(([t, v]) => (
            <div key={t as string} className="rounded-xl bg-stone-50 p-3">
              <p className="text-stone-500">{t}</p>
              <p className="text-lg font-bold text-stone-900">{euros(v as number)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">{cerrada ? fila!.num_cobros : datos.cobros.numCobros} cobros.</p>
      </div>

      {/* CITAS SIN RESOLVER */}
      {!cerrada && datos.pendientes.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">
            {datos.pendientes.length} cita{datos.pendientes.length === 1 ? "" : "s"} sin resolver
          </h2>
          <p className="mb-2 text-sm text-amber-800">
            No se puede cerrar la caja hasta que cada una esté cobrada, cancelada o marcada como no presentada (desde la Agenda).
          </p>
          <ul className="divide-y divide-amber-200 text-sm">
            {datos.pendientes.map((p) => (
              <li key={p.id} className="flex justify-between py-1.5">
                <span><b>{p.hora}</b> · {p.cliente}</span>
                <span className="text-amber-800">{p.barbero}</span>
              </li>
            ))}
          </ul>
          <a href="/admin/dashboard" className="mt-2 inline-block text-sm font-semibold text-amber-900 underline">
            Ir a la Agenda →
          </a>
        </div>
      )}

      {/* CIERRE */}
      {!cerrada && (abierta || !esHoy) && sede.puedeCerrar && (
        <div className={caja}>
          <h2 className="mb-1 font-semibold text-stone-900">Cerrar caja</h2>
          <p className="mb-3 text-sm text-stone-600">
            Debería haber <b>{euros(esperado)}</b> en efectivo ({euros(fondoInicial)} de fondo + {euros(datos.cobros.efectivo)} cobrados).
          </p>
          <label className="mb-1 block text-sm text-stone-600">Efectivo que hay en caja (todo, contando el fondo):</label>
          <input inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} className={input} />
          {diferencia !== null && (
            <p className={"mt-2 text-sm font-semibold " + (diferencia === 0 ? "text-green-700" : "text-red-700")}>
              {diferencia === 0 ? "✅ Cuadra" : `⚠️ ${diferencia > 0 ? "Sobran" : "Faltan"} ${euros(Math.abs(diferencia))}`}
            </p>
          )}
          {diferencia !== null && diferencia !== 0 && (
            <>
              <label className="mb-1 mt-3 block text-sm text-stone-600">¿Por qué no cuadra?</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={input} />
            </>
          )}
          <label className="mb-1 mt-3 block text-sm text-stone-600">Fondo que se deja en caja para mañana:</label>
          <input inputMode="decimal" value={fondoSig} onChange={(e) => setFondoSig(e.target.value)} className={input} />
          {contadoC !== null && aCentimos(fondoSig) !== null && (
            <p className="mt-2 text-sm text-stone-700">
              Al sobre van <b>{euros(Math.max(0, contadoC - (aCentimos(fondoSig) ?? 0)))}</b>.
            </p>
          )}
          <label className="mb-1 mt-3 block text-sm text-stone-600">Foto del sobre:</label>
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fotoRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-stone-300 px-4 py-3 text-sm text-stone-700">
            {foto ? `📷 ${foto.name} (cambiar)` : "📷 Hacer foto del sobre"}
          </button>
          <label className="mb-1 mt-3 block text-sm text-stone-600">Notas (opcional):</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className={input} />
          <button
            disabled={
              enviando || datos.pendientes.length > 0 || contadoC === null || aCentimos(fondoSig) === null || !foto || (diferencia !== 0 && !motivo.trim())
            }
            onClick={cerrar}
            className={boton + " mt-4"}
          >
            {enviando ? "Cerrando…" : "Cerrar caja"}
          </button>
          {datos.pendientes.length > 0 && <p className="mt-2 text-center text-xs text-red-700">Resuelve antes las citas pendientes.</p>}
        </div>
      )}
      {!cerrada && (abierta || !esHoy) && !sede.puedeCerrar && (
        <p className="text-sm text-stone-500">El cierre lo hace el encargado de caja de {sede.nombre}.</p>
      )}

      {/* RESUMEN DEL CIERRE */}
      {cerrada && (
        <div className={caja}>
          <h2 className="mb-2 font-semibold text-stone-900">Resumen del cierre</h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-stone-500">Efectivo esperado</dt><dd className="text-right">{euros(fila!.efectivo_esperado_centimos)}</dd>
            <dt className="text-stone-500">Efectivo contado</dt><dd className="text-right">{euros(fila!.efectivo_contado_centimos)}</dd>
            <dt className="text-stone-500">Diferencia</dt>
            <dd className={"text-right font-semibold " + (fila!.diferencia_centimos ? "text-red-700" : "text-green-700")}>{euros(fila!.diferencia_centimos)}</dd>
            {fila!.motivo_diferencia && (<><dt className="text-stone-500">Motivo</dt><dd className="text-right">{fila!.motivo_diferencia}</dd></>)}
            <dt className="text-stone-500">Al sobre</dt><dd className="text-right">{euros((fila!.efectivo_contado_centimos ?? 0) - (fila!.fondo_siguiente_centimos ?? 0))}</dd>
            <dt className="text-stone-500">Fondo para mañana</dt><dd className="text-right">{euros(fila!.fondo_siguiente_centimos)}</dd>
          </dl>
          {datos.fotoUrl && (
            <a href={datos.fotoUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={datos.fotoUrl} alt="Foto del sobre" className="mt-3 max-h-72 rounded-xl border" />
            </a>
          )}
        </div>
      )}

      {/* SOLO DUEÑO: encargado + historial */}
      {datos.esAdmin && (
        <>
          <div className={caja}>
            <h2 className="mb-2 font-semibold text-stone-900">Encargado de caja de {sede.nombre}</h2>
            <p className="mb-2 text-sm text-stone-500">Solo esta persona (y tú) puede cerrar la caja. Abrir la puede cualquiera del equipo.</p>
            <select value={sede.encargadoId ?? ""} onChange={(e) => void cambiarEncargado(e.target.value)} className={input}>
              <option value="">— Nadie (solo yo) —</option>
              {datos.cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre || "Sin nombre"}</option>
              ))}
            </select>
          </div>

          <div className={caja}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900">Últimos cierres · {sede.nombre}</h2>
              <a href="/api/admin/caja/exportar" className="rounded-full bg-green-700 px-3 py-1.5 text-sm font-semibold text-white">
                Descargar Excel
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500">
                  <tr><th className="py-1">Día</th><th>Total</th><th>Efectivo</th><th>Diferencia</th><th>Cerró</th></tr>
                </thead>
                <tbody>
                  {datos.historial.map((h) => {
                    const total = (h.efectivo_cobrado_centimos ?? 0) + (h.tarjeta_centimos ?? 0) + (h.bizum_centimos ?? 0) + (h.otros_centimos ?? 0);
                    return (
                      <tr key={h.id} className="cursor-pointer border-t hover:bg-stone-50" onClick={() => void cargar(sedeId, h.fecha)}>
                        <td className="py-1.5">{h.fecha.split("-").reverse().join("/")}</td>
                        <td>{h.cerrada_at ? euros(total) : "—"}</td>
                        <td>{h.cerrada_at ? euros(h.efectivo_cobrado_centimos) : "—"}</td>
                        <td className={h.diferencia_centimos ? "font-semibold text-red-700" : "text-green-700"}>
                          {h.cerrada_at ? (h.diferencia_centimos ? euros(h.diferencia_centimos) : "Cuadra") : "Sin cerrar"}
                        </td>
                        <td>{h.cerrada_por_nombre ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

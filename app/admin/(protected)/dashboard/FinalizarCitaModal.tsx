"use client";

import { useEffect, useMemo, useState } from "react";
import { fechaEnMadrid, horaEnMadrid, isoDesdeMadrid } from "@/lib/horarioLocal";

interface Servicio {
  id: string;
  nombre: string;
  precio_centimos: number;
  categoria: string | null;
}
interface Producto {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_centimos: number;
  activo: boolean;
}
interface Cita {
  id: string;
  inicio: string;
  fin: string;
  cliente: { id: string; nombre: string; telefono: string } | null;
  servicio: { id: string; nombre: string } | null;
  profesional: { id: string; nombre: string } | null;
  extras?: { servicio_id: string }[];
}

function euros(centimos: number) {
  return (centimos / 100).toFixed(2);
}

/**
 * Pantalla que se abre al pulsar "Completada" en una cita: además de
 * cerrarla, deja que el barbero corrija de una sentada todo lo que de
 * verdad pasó — el servicio, quién la hizo, el horario real, y lo que se
 * vendió además (complementos y productos). Una vez guardada, la cita
 * queda completada y esta pantalla ya no se vuelve a abrir para ella.
 */
export default function FinalizarCitaModal({
  cita,
  sedeId,
  servicios,
  onCerrar,
  onGuardada,
}: {
  cita: Cita;
  sedeId: string;
  servicios: Servicio[];
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const serviciosPrincipales = useMemo(() => servicios.filter((s) => !s.categoria), [servicios]);
  const serviciosComplemento = useMemo(() => servicios.filter((s) => s.categoria), [servicios]);

  const [servicioId, setServicioId] = useState(cita.servicio?.id ?? serviciosPrincipales[0]?.id ?? "");
  const [profesionalId, setProfesionalId] = useState(cita.profesional?.id ?? "");
  const [profesionales, setProfesionales] = useState<{ id: string; nombre: string }[]>([]);
  const [extrasIds, setExtrasIds] = useState<string[]>(() => (cita.extras ?? []).map((e) => e.servicio_id));
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productosElegidos, setProductosElegidos] = useState<Map<string, number>>(new Map());

  const fechaOriginal = fechaEnMadrid(cita.inicio);
  const [horaInicio, setHoraInicio] = useState(horaEnMadrid(cita.inicio));
  const [horaFin, setHoraFin] = useState(horaEnMadrid(cita.fin));

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/profesionales?sedeId=${sedeId}`)
      .then((r) => r.json())
      .then((j) => setProfesionales(j.profesionales ?? []));
    fetch("/api/admin/productos")
      .then((r) => r.json())
      .then((j) => setProductos((j.productos ?? []).filter((p: Producto) => p.activo)));
  }, [sedeId]);

  function alternarExtra(id: string) {
    setExtrasIds((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  function cambiarCantidadProducto(id: string, cantidad: number) {
    setProductosElegidos((prev) => {
      const copia = new Map(prev);
      if (cantidad <= 0) copia.delete(id);
      else copia.set(id, cantidad);
      return copia;
    });
  }

  const totalServicioCentimos = useMemo(() => {
    const principal = servicios.find((s) => s.id === servicioId)?.precio_centimos ?? 0;
    const extras = extrasIds.reduce((acc, id) => acc + (servicios.find((s) => s.id === id)?.precio_centimos ?? 0), 0);
    return principal + extras;
  }, [servicios, servicioId, extrasIds]);

  const totalProductosCentimos = useMemo(() => {
    let total = 0;
    for (const [id, cantidad] of productosElegidos) {
      total += (productos.find((p) => p.id === id)?.precio_centimos ?? 0) * cantidad;
    }
    return total;
  }, [productos, productosElegidos]);

  async function guardar() {
    if (!servicioId || !profesionalId) {
      setError("Falta el servicio o el profesional.");
      return;
    }
    if (horaFin <= horaInicio) {
      setError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/admin/citas/${cita.id}/finalizar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        servicioId,
        profesionalId,
        inicioISO: isoDesdeMadrid(fechaOriginal, horaInicio),
        finISO: isoDesdeMadrid(fechaOriginal, horaFin),
        extrasServicioIds: extrasIds,
        productos: Array.from(productosElegidos.entries()).map(([productoId, cantidad]) => ({ productoId, cantidad })),
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "No se pudo finalizar la cita.");
      return;
    }
    onGuardada();
  }

  const productosPorCategoria = useMemo(() => {
    const grupos = new Map<string, Producto[]>();
    for (const p of productos) {
      const clave = p.categoria ?? "Otros";
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave)!.push(p);
    }
    return grupos;
  }, [productos]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Finalizar cita</h2>
            <p className="text-sm text-stone-500">{cita.cliente?.nombre ?? "Cliente"}</p>
          </div>
          <button onClick={onCerrar} className="text-stone-400 hover:text-stone-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">Servicio realizado</label>
            <select value={servicioId} onChange={(e) => setServicioId(e.target.value)} className="w-full rounded-lg border border-stone-300 p-2 text-sm">
              {serviciosPrincipales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {euros(s.precio_centimos)}€
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">Quién la hizo</label>
            <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className="w-full rounded-lg border border-stone-300 p-2 text-sm">
              {cita.profesional && !profesionales.some((p) => p.id === cita.profesional!.id) && (
                <option value={cita.profesional.id}>{cita.profesional.nombre}</option>
              )}
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">Hora de inicio</label>
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full rounded-lg border border-stone-300 p-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">Hora de fin</label>
              <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full rounded-lg border border-stone-300 p-2 text-sm" />
            </div>
          </div>

          {serviciosComplemento.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">Complementos añadidos</label>
              <div className="flex flex-wrap gap-1.5">
                {serviciosComplemento.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => alternarExtra(s.id)}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs " +
                      (extrasIds.includes(s.id)
                        ? "border-brand-yellow bg-brand-yellow/20 font-semibold text-brand-yellow-dark"
                        : "border-stone-300 text-stone-600 hover:border-stone-400")
                    }
                  >
                    {s.nombre} · {euros(s.precio_centimos)}€
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-500">
              Productos vendidos <span className="normal-case text-stone-400">(no se ven ni se venden desde la app)</span>
            </label>
            {productos.length === 0 && <p className="text-sm text-stone-400">Sin productos en el catálogo todavía.</p>}
            <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border border-stone-200 p-2">
              {Array.from(productosPorCategoria.entries()).map(([categoria, items]) => (
                <div key={categoria}>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-stone-400">{categoria}</div>
                  <div className="space-y-1">
                    {items.map((p) => {
                      const cantidad = productosElegidos.get(p.id) ?? 0;
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-stone-700">
                            {p.nombre} · {euros(p.precio_centimos)}€
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => cambiarCantidadProducto(p.id, cantidad - 1)}
                              disabled={cantidad === 0}
                              className="h-6 w-6 rounded-full border border-stone-300 text-stone-600 disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center">{cantidad}</span>
                            <button
                              type="button"
                              onClick={() => cambiarCantidadProducto(p.id, cantidad + 1)}
                              className="h-6 w-6 rounded-full border border-stone-300 text-stone-600"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
            <div className="flex justify-between">
              <span>Servicio + complementos</span>
              <span className="font-medium">{euros(totalServicioCentimos)}€</span>
            </div>
            {totalProductosCentimos > 0 && (
              <div className="flex justify-between">
                <span>Productos</span>
                <span className="font-medium">{euros(totalProductosCentimos)}€</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              disabled={guardando}
              onClick={guardar}
              className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Marcar como completada"}
            </button>
            <button onClick={onCerrar} className="text-sm text-stone-500 underline">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

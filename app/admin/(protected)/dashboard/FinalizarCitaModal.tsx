"use client";

import { useEffect, useMemo, useState } from "react";
import { fechaEnMadrid, horaEnMadrid, isoDesdeMadrid } from "@/lib/horarioLocal";
import { colorPorRotacion } from "@/lib/coloresServicio";

interface Servicio {
  id: string;
  nombre: string;
  precio_centimos: number;
  categoria: string | null;
  color?: string | null;
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
  cliente: { id: string; nombre: string; telefono: string | null } | null;
  servicio: { id: string; nombre: string } | null;
  profesional: { id: string; nombre: string } | null;
  extras?: { servicio_id: string }[];
}

const METODOS_PAGO: { id: string; etiqueta: string; icono: string }[] = [
  { id: "efectivo", etiqueta: "Efectivo", icono: "💵" },
  { id: "tarjeta", etiqueta: "Tarjeta", icono: "💳" },
  { id: "bizum", etiqueta: "Bizum", icono: "📱" },
  { id: "otro", etiqueta: "Otro", icono: "✏️" },
];

function euros(centimos: number) {
  return (centimos / 100).toFixed(2);
}

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Cabecera de sección: icono + título, siempre con el mismo estilo. */
function Seccion({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
        <span className="text-base">{icono}</span>
        {titulo}
      </div>
      {children}
    </div>
  );
}

/**
 * Pantalla que se abre al pulsar "Completada" en una cita: el checkout de
 * verdad del barbero. En un único guardado deja corregir todo lo que hizo
 * falta de la reserva original — el servicio, quién la hizo, el horario
 * real, los complementos y productos vendidos, el método de pago, y si
 * hace falta, el precio final a mano — y cierra la cita como completada.
 * Diseñado para tocarse con el dedo desde el móvil del barbero: tarjetas
 * de colores en vez de desplegables y enlaces subrayados.
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
  const [metodoPago, setMetodoPago] = useState<string | null>(null);

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

  // "Servicio" = precio del servicio principal + complementos: es el
  // importe que se puede corregir a mano (precioManualCentimos) y el que
  // cuentan comisiones, fidelización, HubSpot e historial del cliente
  // (ver lib/precios.ts). Los productos van siempre aparte, a precio de
  // catálogo — nunca han generado saldo ni comisión de servicio.
  const totalServicioAutomaticoCentimos = useMemo(() => {
    const principal = servicios.find((s) => s.id === servicioId)?.precio_centimos ?? 0;
    const extras = extrasIds.reduce((acc, id) => acc + (servicios.find((s) => s.id === id)?.precio_centimos ?? 0), 0);
    return principal + extras;
  }, [servicios, servicioId, extrasIds]);

  const [precioManualCentimos, setPrecioManualCentimos] = useState<number | null>(null);
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [precioManualTexto, setPrecioManualTexto] = useState("");

  // Si el barbero todavía no ha tocado el precio, el "final" sigue al
  // automático aunque cambie el servicio o los complementos.
  const totalServicioCentimos = precioManualCentimos ?? totalServicioAutomaticoCentimos;

  function empezarAEditarPrecio() {
    setPrecioManualTexto(euros(totalServicioCentimos));
    setEditandoPrecio(true);
  }

  function confirmarPrecioManual() {
    const valor = Math.round(Number(precioManualTexto.replace(",", ".")) * 100);
    if (Number.isFinite(valor) && valor >= 0) setPrecioManualCentimos(valor);
    setEditandoPrecio(false);
  }

  function restablecerPrecio() {
    setPrecioManualCentimos(null);
    setEditandoPrecio(false);
  }

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
        metodoPago,
        ...(precioManualCentimos !== null ? { precioFinalCentimos: precioManualCentimos } : {}),
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

  const totalACobrarCentimos = totalServicioCentimos + totalProductosCentimos;
  const precioTocado = precioManualCentimos !== null && precioManualCentimos !== totalServicioAutomaticoCentimos;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-8 sm:p-4 sm:pt-10">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-stone-50 shadow-2xl">
        {/* Cabecera con degradado — es "el checkout", así que se nota */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-emerald-100">Finalizar cita</div>
              <h2 className="text-xl font-bold">{cita.cliente?.nombre ?? "Cliente"}</h2>
            </div>
            <button
              onClick={onCerrar}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-4">
          <Seccion icono="✂️" titulo="Servicio realizado">
            <div className="flex flex-wrap gap-2">
              {serviciosPrincipales.map((s) => {
                const activo = servicioId === s.id;
                const color = s.color || "#a8a29e";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setServicioId(s.id)}
                    className={
                      "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition " +
                      (activo ? "text-stone-900 shadow-sm" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")
                    }
                    style={activo ? { borderColor: color, backgroundColor: color + "1a" } : undefined}
                  >
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    {s.nombre}
                    <span className="text-xs text-stone-400">{euros(s.precio_centimos)}€</span>
                  </button>
                );
              })}
            </div>
          </Seccion>

          <Seccion icono="🧑‍🔧" titulo="Quién la hizo">
            <div className="flex flex-wrap gap-2">
              {(cita.profesional && !profesionales.some((p) => p.id === cita.profesional!.id)
                ? [cita.profesional, ...profesionales]
                : profesionales
              ).map((p, i) => {
                const activo = profesionalId === p.id;
                const color = colorPorRotacion(i);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfesionalId(p.id)}
                    className={
                      "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition " +
                      (activo ? "text-stone-900 shadow-sm" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")
                    }
                    style={activo ? { borderColor: color, backgroundColor: color + "1a" } : undefined}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {iniciales(p.nombre)}
                    </span>
                    {p.nombre}
                  </button>
                );
              })}
            </div>
          </Seccion>

          <Seccion icono="🕐" titulo="Horario real">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-400">Inicio</label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-stone-400">Fin</label>
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 p-2.5 text-sm"
                />
              </div>
            </div>
          </Seccion>

          {serviciosComplemento.length > 0 && (
            <Seccion icono="➕" titulo="Complementos añadidos">
              <div className="flex flex-wrap gap-2">
                {serviciosComplemento.map((s) => {
                  const activo = extrasIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => alternarExtra(s.id)}
                      className={
                        "flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-medium transition " +
                        (activo
                          ? "border-brand-yellow bg-brand-yellow/20 text-brand-yellow-dark"
                          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")
                      }
                    >
                      {activo && "✓ "}
                      {s.nombre} · {euros(s.precio_centimos)}€
                    </button>
                  );
                })}
              </div>
            </Seccion>
          )}

          <Seccion icono="🛍️" titulo="Productos vendidos">
            <p className="mb-2 -mt-1 text-xs text-stone-400">No se ven ni se venden desde la app del cliente.</p>
            {productos.length === 0 && <p className="text-sm text-stone-400">Sin productos en el catálogo todavía.</p>}
            <div className="max-h-44 space-y-3 overflow-y-auto">
              {Array.from(productosPorCategoria.entries()).map(([categoria, items]) => (
                <div key={categoria}>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-stone-400">{categoria}</div>
                  <div className="space-y-1">
                    {items.map((p) => {
                      const cantidad = productosElegidos.get(p.id) ?? 0;
                      return (
                        <div
                          key={p.id}
                          className={
                            "flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-sm " +
                            (cantidad > 0 ? "border-brand-yellow/50 bg-brand-yellow/10" : "border-stone-100")
                          }
                        >
                          <span className="text-stone-700">
                            {p.nombre} · {euros(p.precio_centimos)}€
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => cambiarCantidadProducto(p.id, cantidad - 1)}
                              disabled={cantidad === 0}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 text-stone-600 disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center font-medium">{cantidad}</span>
                            <button
                              type="button"
                              onClick={() => cambiarCantidadProducto(p.id, cantidad + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 text-stone-600"
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
          </Seccion>

          <Seccion icono="💳" titulo="Método de pago">
            <div className="flex flex-wrap gap-2">
              {METODOS_PAGO.map((m) => {
                const activo = metodoPago === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodoPago(activo ? null : m.id)}
                    className={
                      "flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-medium transition " +
                      (activo
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")
                    }
                  >
                    <span>{m.icono}</span>
                    {m.etiqueta}
                  </button>
                );
              })}
            </div>
          </Seccion>

          <Seccion icono="💰" titulo="Precio final">
            <div className="space-y-2 text-sm text-stone-700">
              <div className="flex items-center justify-between">
                <span>Servicio + complementos</span>
                {editandoPrecio ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={precioManualTexto}
                      onChange={(e) => setPrecioManualTexto(e.target.value)}
                      className="w-24 rounded-lg border border-emerald-400 p-1.5 text-right text-sm font-semibold"
                    />
                    <span>€</span>
                    <button
                      onClick={confirmarPrecioManual}
                      className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{euros(totalServicioCentimos)}€</span>
                    <button onClick={empezarAEditarPrecio} className="text-stone-400 hover:text-stone-600" title="Editar precio a mano" aria-label="Editar precio">
                      ✏️
                    </button>
                  </div>
                )}
              </div>
              {precioTocado && !editandoPrecio && (
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                  <span>Precio corregido a mano (catálogo: {euros(totalServicioAutomaticoCentimos)}€)</span>
                  <button onClick={restablecerPrecio} className="font-medium underline">
                    Restablecer
                  </button>
                </div>
              )}
              {totalProductosCentimos > 0 && (
                <div className="flex justify-between">
                  <span>Productos</span>
                  <span className="font-medium">{euros(totalProductosCentimos)}€</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-stone-200 pt-2 text-base">
                <span className="font-semibold text-stone-900">Total a cobrar</span>
                <span className="text-lg font-bold text-emerald-700">{euros(totalACobrarCentimos)}€</span>
              </div>
            </div>
          </Seccion>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-stone-200 bg-white p-4">
          <button
            disabled={guardando}
            onClick={guardar}
            className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3 text-center text-sm font-bold text-white shadow-md transition hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "✓ Marcar como completada"}
          </button>
          <button
            onClick={onCerrar}
            className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-200"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

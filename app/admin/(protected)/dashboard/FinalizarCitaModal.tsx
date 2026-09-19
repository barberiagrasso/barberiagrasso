"use client";

import { useEffect, useMemo, useState } from "react";
import { fechaEnMadrid, horaEnMadrid, isoDesdeMadrid } from "@/lib/horarioLocal";
import {
  IconScissors,
  IconUser,
  IconClock,
  IconPlus,
  IconBag,
  IconCard,
  IconCoin,
  IconPencil,
  IconCheck,
  IconX,
  IconBanknote,
  IconSmartphone,
  IconDots,
} from "@/components/ui/Icons";

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

const METODOS_PAGO: { id: string; etiqueta: string; Icono: typeof IconCard }[] = [
  { id: "efectivo", etiqueta: "Efectivo", Icono: IconBanknote },
  { id: "tarjeta", etiqueta: "Tarjeta", Icono: IconCard },
  { id: "bizum", etiqueta: "Bizum", Icono: IconSmartphone },
  { id: "otro", etiqueta: "Otro", Icono: IconDots },
];

function euros(centimos: number) {
  return (centimos / 100).toFixed(2);
}

/** Cabecera de sección: icono pequeño + etiqueta en mayúsculas, sin tarjeta ni sombra. */
function Etiqueta({ icono: Icono, texto }: { icono: typeof IconCard; texto: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
      <Icono className="h-3.5 w-3.5" />
      {texto}
    </div>
  );
}

/**
 * Pantalla que se abre al pulsar "Completada" en una cita: el checkout de
 * verdad del barbero. En un único guardado deja corregir todo lo que hizo
 * falta de la reserva original — el servicio, quién la hizo, el horario
 * real, los complementos y productos vendidos, el método de pago, y si
 * hace falta, el precio final a mano — y cierra la cita como completada.
 * Diseño minimalista con desplegables (no tarjetas ni emoji): un
 * desplegable "añadir" para complementos y productos, con la lista de lo
 * ya añadido debajo y un botón para quitar cada línea.
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
  const [complementoParaAnadir, setComplementoParaAnadir] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [productosElegidos, setProductosElegidos] = useState<Map<string, number>>(new Map());
  const [productoParaAnadir, setProductoParaAnadir] = useState("");
  const [metodoPago, setMetodoPago] = useState<string | null>(null);

  const fechaOriginal = fechaEnMadrid(cita.inicio);
  const [horaInicio, setHoraInicio] = useState(horaEnMadrid(cita.inicio));
  const [horaFin, setHoraFin] = useState(horaEnMadrid(cita.fin));

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Se pasa la fecha de la cita para que, si ese día hay un profesional
    // puntualmente destinado a esta sede (p.ej. Juan en Los Molinos),
    // también aparezca como opción en "Quién la hizo" aunque no sea de
    // aquí de forma habitual.
    fetch(`/api/profesionales?sedeId=${sedeId}&fecha=${fechaOriginal}`)
      .then((r) => r.json())
      .then((j) => setProfesionales(j.profesionales ?? []));
    fetch("/api/admin/productos")
      .then((r) => r.json())
      .then((j) => setProductos((j.productos ?? []).filter((p: Producto) => p.activo)));
  }, [sedeId, fechaOriginal]);

  function anadirComplemento() {
    if (!complementoParaAnadir) return;
    setExtrasIds((prev) => (prev.includes(complementoParaAnadir) ? prev : [...prev, complementoParaAnadir]));
    setComplementoParaAnadir("");
  }

  function quitarComplemento(id: string) {
    setExtrasIds((prev) => prev.filter((e) => e !== id));
  }

  function cambiarCantidadProducto(id: string, cantidad: number) {
    setProductosElegidos((prev) => {
      const copia = new Map(prev);
      if (cantidad <= 0) copia.delete(id);
      else copia.set(id, cantidad);
      return copia;
    });
  }

  function anadirProducto() {
    if (!productoParaAnadir) return;
    cambiarCantidadProducto(productoParaAnadir, (productosElegidos.get(productoParaAnadir) ?? 0) + 1);
    setProductoParaAnadir("");
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

  const colorServicioSeleccionado = servicios.find((s) => s.id === servicioId)?.color || "#a8a29e";
  const totalACobrarCentimos = totalServicioCentimos + totalProductosCentimos;
  const precioTocado = precioManualCentimos !== null && precioManualCentimos !== totalServicioAutomaticoCentimos;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 pt-8 sm:p-4 sm:pt-10">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Finalizar cita</div>
            <h2 className="text-lg font-bold text-stone-900">{cita.cliente?.nombre ?? "Cliente"}</h2>
          </div>
          <button
            onClick={onCerrar}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="Cerrar"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] divide-y divide-stone-100 overflow-y-auto px-5">
          <div className="py-4">
            <Etiqueta icono={IconScissors} texto="Servicio realizado" />
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorServicioSeleccionado }} />
              <select
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2.5 text-sm"
              >
                {serviciosPrincipales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {euros(s.precio_centimos)}€
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="py-4">
            <Etiqueta icono={IconUser} texto="Quién la hizo" />
            <select
              value={profesionalId}
              onChange={(e) => setProfesionalId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 p-2.5 text-sm"
            >
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

          <div className="py-4">
            <Etiqueta icono={IconClock} texto="Horario real" />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2.5 text-sm"
              />
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2.5 text-sm"
              />
            </div>
          </div>

          {serviciosComplemento.length > 0 && (
            <div className="py-4">
              <Etiqueta icono={IconPlus} texto="Complementos" />
              <div className="flex gap-2">
                <select
                  value={complementoParaAnadir}
                  onChange={(e) => setComplementoParaAnadir(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-stone-700"
                >
                  <option value="">Selecciona un complemento…</option>
                  {serviciosComplemento
                    .filter((s) => !extrasIds.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre} · {euros(s.precio_centimos)}€
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={anadirComplemento}
                  disabled={!complementoParaAnadir}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-600 hover:border-stone-400 disabled:opacity-40"
                >
                  <IconPlus className="h-4 w-4" />
                  Añadir
                </button>
              </div>
              {extrasIds.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {extrasIds.map((id) => {
                    const s = servicios.find((x) => x.id === id);
                    if (!s) return null;
                    return (
                      <li key={id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5 text-sm text-stone-700">
                        <span>
                          {s.nombre} · {euros(s.precio_centimos)}€
                        </span>
                        <button
                          type="button"
                          onClick={() => quitarComplemento(id)}
                          className="text-stone-400 hover:text-red-600"
                          aria-label={`Quitar ${s.nombre}`}
                        >
                          <IconX className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-stone-400">Sin complementos añadidos.</p>
              )}
            </div>
          )}

          <div className="py-4">
            <Etiqueta icono={IconBag} texto="Productos vendidos" />
            <div className="flex gap-2">
              <select
                value={productoParaAnadir}
                onChange={(e) => setProductoParaAnadir(e.target.value)}
                className="w-full rounded-lg border border-stone-300 p-2.5 text-sm text-stone-700"
              >
                <option value="">Selecciona un producto…</option>
                {Array.from(productosPorCategoria.entries()).map(([categoria, items]) => {
                  const disponibles = items.filter((p) => !productosElegidos.has(p.id));
                  if (disponibles.length === 0) return null;
                  return (
                    <optgroup key={categoria} label={categoria}>
                      {disponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · {euros(p.precio_centimos)}€
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={anadirProducto}
                disabled={!productoParaAnadir}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-600 hover:border-stone-400 disabled:opacity-40"
              >
                <IconPlus className="h-4 w-4" />
                Añadir
              </button>
            </div>
            <p className="mt-1.5 text-xs text-stone-400">No se ven ni se venden desde la app del cliente.</p>
            {productosElegidos.size > 0 && (
              <ul className="mt-2 space-y-1.5">
                {Array.from(productosElegidos.entries()).map(([id, cantidad]) => {
                  const p = productos.find((x) => x.id === id);
                  if (!p) return null;
                  return (
                    <li key={id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5 text-sm text-stone-700">
                      <span>
                        {p.nombre} · {euros(p.precio_centimos)}€
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => cambiarCantidadProducto(id, cantidad - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 text-stone-600"
                        >
                          −
                        </button>
                        <span className="w-4 text-center font-medium">{cantidad}</span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidadProducto(id, cantidad + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 text-stone-600"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => cambiarCantidadProducto(id, 0)}
                          className="ml-1 text-stone-400 hover:text-red-600"
                          aria-label={`Quitar ${p.nombre}`}
                        >
                          <IconX className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="py-4">
            <Etiqueta icono={IconCard} texto="Método de pago" />
            <div className="flex flex-wrap gap-2">
              {METODOS_PAGO.map((m) => {
                const activo = metodoPago === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodoPago(activo ? null : m.id)}
                    className={
                      "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                      (activo
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-stone-200 text-stone-600 hover:border-stone-300")
                    }
                  >
                    <m.Icono className="h-4 w-4" />
                    {m.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="py-4">
            <Etiqueta icono={IconCoin} texto="Precio final" />
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
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                      aria-label="Confirmar precio"
                    >
                      <IconCheck className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{euros(totalServicioCentimos)}€</span>
                    <button onClick={empezarAEditarPrecio} className="text-stone-400 hover:text-stone-600" title="Editar precio a mano" aria-label="Editar precio">
                      <IconPencil className="h-4 w-4" />
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
          </div>

          {error && <p className="py-3 text-sm font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-stone-100 p-4">
          <button
            disabled={guardando}
            onClick={guardar}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <IconCheck className="h-4 w-4" />
            {guardando ? "Guardando…" : "Marcar como completada"}
          </button>
          <button onClick={onCerrar} className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-100">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { textoPedido, type EstadoStock } from "@/lib/stock";

interface Producto {
  id: string;
  nombre: string;
  categoria: string | null;
  stock: number;
  minimo: number;
  ideal: number;
  contado: boolean;
  estado: EstadoStock;
  aPedir: number;
}

interface Movimiento {
  id: string;
  producto: string;
  tipo: "venta" | "entrada" | "recuento" | "ajuste";
  cantidad: number;
  stock_resultante: number;
  nota: string | null;
  admin_nombre: string | null;
  created_at: string;
}

interface Datos {
  esAdmin: boolean;
  sedes: { id: string; nombre: string; encargadoId: string | null }[];
  sedeId: string;
  productos: Producto[];
  movimientos: Movimiento[];
  cuentas: { id: string; nombre: string; rol: string }[];
}

const ETIQUETA_ESTADO: Record<EstadoStock, { texto: string; clase: string }> = {
  agotado: { texto: "Agotado", clase: "bg-red-100 text-red-700" },
  pedir: { texto: "Pedir", clase: "bg-amber-100 text-amber-800" },
  ok: { texto: "Bien", clase: "bg-emerald-100 text-emerald-700" },
};

const ETIQUETA_MOV: Record<Movimiento["tipo"], string> = {
  venta: "Venta",
  entrada: "Llegó pedido",
  recuento: "Recuento",
  ajuste: "Ajuste",
};

export default function StockClient() {
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState<{ producto: Producto; tipo: "entrada" | "recuento" | "ajuste" } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async (sede: string | null) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stock${sede ? `?sedeId=${sede}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el stock.");
      setDatos(json);
      setSedeId(json.sedeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el stock.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(null);
  }, [cargar]);

  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!datos) return <p className="text-sm text-stone-500">Cargando stock…</p>;

  const sede = datos.sedes.find((s) => s.id === sedeId);
  const aPedir = datos.productos.filter((p) => p.aPedir > 0);
  const sinContar = datos.productos.filter((p) => !p.contado).length;
  const pedido = textoPedido(sede?.nombre ?? "", aPedir.map((p) => ({ nombre: p.nombre, unidades: p.aPedir })));

  async function copiarPedido() {
    try {
      await navigator.clipboard.writeText(pedido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin portapapeles: el texto sigue visible para copiarlo a mano */
    }
  }

  return (
    <div className="space-y-5">
      {datos.sedes.length > 1 && (
        <div className="flex gap-2">
          {datos.sedes.map((s) => (
            <button
              key={s.id}
              onClick={() => cargar(s.id)}
              className={"rounded-full px-4 py-1.5 text-sm " + (s.id === sedeId ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600")}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}

      {datos.esAdmin && sede && (
        <Encargado sede={sede} cuentas={datos.cuentas} alGuardar={() => cargar(sede.id)} />
      )}

      {sinContar > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Hay {sinContar} {sinContar === 1 ? "producto" : "productos"} sin contar todavía en esta sede. Pulsa
          &quot;Recuento&quot; en cada uno y pon las unidades que hay de verdad en la estantería.
        </p>
      )}

      {/* Pedido */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-stone-500">
            Pedido — {aPedir.length === 0 ? "no falta nada" : `${aPedir.length} ${aPedir.length === 1 ? "producto" : "productos"}`}
          </h2>
          {aPedir.length > 0 && (
            <div className="flex gap-2">
              <button onClick={copiarPedido} className="rounded border border-stone-300 px-3 py-1 text-xs font-semibold text-stone-700">
                {copiado ? "¡Copiado!" : "Copiar pedido"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(pedido)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Mandar por WhatsApp
              </a>
            </div>
          )}
        </div>
        {aPedir.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {aPedir.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-stone-50 py-1">
                <span className="text-stone-800">{p.nombre}</span>
                <span className="font-semibold text-stone-900">
                  {p.aPedir} uds <span className="font-normal text-stone-400">(hay {p.stock})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Productos */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Productos {cargando && "· actualizando…"}</h2>
        <div className="divide-y divide-stone-100">
          {datos.productos.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-900">{p.nombre}</div>
                <div className="text-xs text-stone-400">
                  Mínimo {p.minimo} · ideal {p.ideal}
                  {datos.esAdmin && sede && <Limites producto={p} sedeId={sede.id} alGuardar={() => cargar(sede.id)} />}
                </div>
              </div>
              <span className={"rounded px-2 py-0.5 text-[11px] font-semibold uppercase " + ETIQUETA_ESTADO[p.estado].clase}>
                {ETIQUETA_ESTADO[p.estado].texto}
              </span>
              <span className="w-14 text-right text-lg font-bold text-stone-900">{p.contado ? p.stock : "—"}</span>
              <div className="flex gap-1">
                <button onClick={() => setAccion({ producto: p, tipo: "entrada" })} className="rounded bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white">
                  + Llegó
                </button>
                <button onClick={() => setAccion({ producto: p, tipo: "recuento" })} className="rounded border border-stone-300 px-2.5 py-1 text-xs text-stone-700">
                  Recuento
                </button>
                <button onClick={() => setAccion({ producto: p, tipo: "ajuste" })} className="rounded border border-stone-300 px-2.5 py-1 text-xs text-stone-700">
                  Ajuste
                </button>
              </div>
            </div>
          ))}
          {datos.productos.length === 0 && <p className="py-2 text-sm text-stone-500">No hay productos activos. Dalos de alta en Mi barbería → Productos.</p>}
        </div>
      </section>

      {/* Historial */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">Últimos movimientos</h2>
        {datos.movimientos.length === 0 ? (
          <p className="text-sm text-stone-500">Todavía no hay movimientos en esta sede.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {datos.movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-stone-50 py-1">
                <span className="text-stone-700">
                  <b>{ETIQUETA_MOV[m.tipo]}</b> · {m.producto}
                  {m.nota && <span className="text-stone-400"> · {m.nota}</span>}
                </span>
                <span className="text-stone-500">
                  <b className={m.cantidad >= 0 ? "text-emerald-700" : "text-red-700"}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</b> → {m.stock_resultante} ·{" "}
                  {m.admin_nombre ?? "—"} · {new Date(m.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accion && sede && (
        <VentanaMovimiento
          producto={accion.producto}
          tipo={accion.tipo}
          sedeId={sede.id}
          alCerrar={() => setAccion(null)}
          alGuardar={() => {
            setAccion(null);
            cargar(sede.id);
          }}
        />
      )}
    </div>
  );
}

function Encargado({ sede, cuentas, alGuardar }: { sede: Datos["sedes"][number]; cuentas: Datos["cuentas"]; alGuardar: () => void }) {
  const [guardando, setGuardando] = useState(false);
  async function cambiar(adminId: string) {
    setGuardando(true);
    await fetch("/api/admin/stock/encargado", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sedeId: sede.id, adminId: adminId || null }),
    });
    setGuardando(false);
    alGuardar();
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <span className="text-stone-600">Encargado de stock de {sede.nombre}:</span>
      <select
        value={sede.encargadoId ?? ""}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded border border-stone-300 px-2 py-1"
      >
        <option value="">— Nadie (solo tú) —</option>
        {cuentas
          .filter((c) => c.rol === "barbero")
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
      </select>
      <span className="text-xs text-stone-400">Verá &quot;Stock&quot; en su menú, solo de esta sede.</span>
    </div>
  );
}

function Limites({ producto, sedeId, alGuardar }: { producto: Producto; sedeId: string; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [minimo, setMinimo] = useState(String(producto.minimo));
  const [ideal, setIdeal] = useState(String(producto.ideal));
  const [error, setError] = useState<string | null>(null);
  if (!abierto)
    return (
      <button onClick={() => setAbierto(true)} className="ml-2 underline">
        cambiar
      </button>
    );
  async function guardar() {
    const res = await fetch("/api/admin/stock/limites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productoId: producto.id, sedeId, minimo: Number(minimo), ideal: Number(ideal) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error || "No se pudo guardar.");
    setAbierto(false);
    alGuardar();
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      mín <input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="numeric" className="w-12 rounded border px-1" />
      ideal <input value={ideal} onChange={(e) => setIdeal(e.target.value)} inputMode="numeric" className="w-12 rounded border px-1" />
      <button onClick={guardar} className="rounded bg-stone-900 px-2 text-white">
        OK
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}

function VentanaMovimiento({
  producto,
  tipo,
  sedeId,
  alCerrar,
  alGuardar,
}: {
  producto: Producto;
  tipo: "entrada" | "recuento" | "ajuste";
  sedeId: string;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [cantidad, setCantidad] = useState(tipo === "recuento" ? String(producto.contado ? producto.stock : "") : "");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textos = {
    entrada: { titulo: "Llegó pedido", pregunta: "¿Cuántas unidades han llegado?", boton: "Sumar al stock" },
    recuento: { titulo: "Recuento", pregunta: "¿Cuántas unidades hay ahora mismo en la estantería?", boton: "Guardar recuento" },
    ajuste: { titulo: "Ajuste", pregunta: "Unidades a quitar (con −) o a sumar. Ej.: −1 si se rompió uno.", boton: "Guardar ajuste" },
  }[tipo];

  async function guardar() {
    const n = Number(cantidad.replace("−", "-"));
    if (!Number.isInteger(n)) return setError("Escribe un número entero.");
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/admin/stock/movimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productoId: producto.id, sedeId, tipo, cantidad: n, nota }),
    });
    const json = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) return setError(json.error || "No se pudo guardar.");
    alGuardar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={alCerrar}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-stone-900">{textos.titulo}</h3>
        <p className="text-sm text-stone-500">
          {producto.nombre} · ahora hay {producto.contado ? producto.stock : "sin contar"}
        </p>
        <label className="mt-4 block text-sm text-stone-700">{textos.pregunta}</label>
        <input
          autoFocus
          inputMode={tipo === "ajuste" ? "text" : "numeric"}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 p-2 text-lg"
        />
        <input
          placeholder={tipo === "ajuste" ? "Motivo (rotura, regalo…)" : "Nota (opcional)"}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="mt-2 w-full rounded border border-stone-300 p-2 text-sm"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={alCerrar} className="flex-1 rounded border border-stone-300 py-2 text-sm">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando} className="flex-1 rounded bg-stone-900 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {guardando ? "Guardando…" : textos.boton}
          </button>
        </div>
      </div>
    </div>
  );
}

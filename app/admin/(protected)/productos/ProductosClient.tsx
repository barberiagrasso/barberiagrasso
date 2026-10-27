"use client";

import { useRef, useState } from "react";
import { reducirFoto } from "@/lib/imagenes";

interface Producto {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_centimos: number;
  orden: number;
  activo: boolean;
  stock: number | null;
  stock_minimo: number | null;
  // Merch / tienda de la app y GrassoCoins (27/10/2026).
  coste_grassocoins?: number | null;
  visible_en_app?: boolean;
  descripcion?: string | null;
  foto_url?: string | null;
}

// Vacío o 0 = no se puede canjear (null).
function coinsDesdeTexto(texto: string): number | null {
  const n = parseInt(texto, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Los grupos ya usados en el catálogo inicial, para que Diego pueda
// elegir uno existente en vez de escribirlo a mano y arriesgarse a una
// errata que cree un grupo duplicado.
const CATEGORIAS_CONOCIDAS = [
  "Cuidado y tratamiento capilar",
  "Cabello rizado",
  "Canas y matización",
  "Ceras y fijación",
  "Polvos de peinado",
  "Barba y afeitado",
  "Prótesis y fibra capilar",
  "Accesorios",
  "Merch Grasso",
];

function euros(centimos: number) {
  return (centimos / 100).toFixed(2);
}

export default function ProductosClient({ productos: inicial }: { productos: Producto[] }) {
  const [productos, setProductos] = useState(inicial);
  const [creando, setCreando] = useState(false);

  async function recargar() {
    const res = await fetch("/api/admin/productos");
    const json = await res.json();
    setProductos(json.productos ?? []);
  }

  async function guardar(id: string, cambios: Partial<Producto>) {
    const res = await fetch(`/api/admin/productos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (res.ok) {
      const { producto } = await res.json();
      setProductos((prev) => prev.map((p) => (p.id === id ? producto : p)));
    }
    return res;
  }

  const sinCategoria = productos.filter((p) => !p.categoria).sort((a, b) => a.orden - b.orden);
  const grupos = new Map<string, Producto[]>();
  for (const p of productos) {
    if (!p.categoria) continue;
    if (!grupos.has(p.categoria)) grupos.set(p.categoria, []);
    grupos.get(p.categoria)!.push(p);
  }
  for (const items of grupos.values()) items.sort((a, b) => a.orden - b.orden);

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="rounded-none bg-brand-black px-3 py-2 text-sm font-medium text-brand-white hover:opacity-85 transition-opacity"
        >
          {creando ? "Cerrar" : "+ Nuevo producto"}
        </button>
        {creando && (
          <NuevoProductoForm
            onCreado={() => {
              setCreando(false);
              recargar();
            }}
          />
        )}
      </div>

      {Array.from(grupos.entries()).map(([categoria, items]) => (
        <SeccionProductos key={categoria} titulo={categoria} items={items} onGuardar={guardar} />
      ))}

      {sinCategoria.length > 0 && <SeccionProductos titulo="Sin categoría" items={sinCategoria} onGuardar={guardar} />}
    </div>
  );
}

function SeccionProductos({
  titulo,
  items,
  onGuardar,
}: {
  titulo: string;
  items: Producto[];
  onGuardar: (id: string, cambios: Partial<Producto>) => Promise<Response>;
}) {
  return (
    <div>
      <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">{titulo}</h2>
      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {items.map((p) => (
          <FilaProducto key={p.id} producto={p} onGuardar={onGuardar} />
        ))}
        {items.length === 0 && <p className="p-3 text-sm text-stone-400">Sin productos en este grupo.</p>}
      </div>
    </div>
  );
}

function FilaProducto({
  producto,
  onGuardar,
}: {
  producto: Producto;
  onGuardar: (id: string, cambios: Partial<Producto>) => Promise<Response>;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(producto.nombre);
  const [precio, setPrecio] = useState(euros(producto.precio_centimos));
  const [categoria, setCategoria] = useState(producto.categoria ?? "");
  const [orden, setOrden] = useState(String(producto.orden));
  const [stock, setStock] = useState(producto.stock === null ? "" : String(producto.stock));
  const [stockMinimo, setStockMinimo] = useState(producto.stock_minimo === null ? "" : String(producto.stock_minimo));
  const [coinsTexto, setCoinsTexto] = useState(producto.coste_grassocoins ? String(producto.coste_grassocoins) : "");
  const [visibleEnApp, setVisibleEnApp] = useState(Boolean(producto.visible_en_app));
  const [descripcion, setDescripcion] = useState(producto.descripcion ?? "");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState(producto.foto_url ?? null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendoFoto(true);
    setError(null);
    try {
      const imagenBase64 = await reducirFoto(archivo, 1200);
      const res = await fetch(`/api/admin/productos/${producto.id}/foto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo subir la foto.");
      setFotoUrl(json.producto?.foto_url ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendoFoto(false);
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await onGuardar(producto.id, {
      nombre,
      precio_centimos: Math.round(parseFloat(precio.replace(",", ".")) * 100),
      categoria: categoria || null,
      orden: parseInt(orden, 10) || 0,
      stock: stock.trim() === "" ? null : parseInt(stock, 10) || 0,
      stock_minimo: stockMinimo.trim() === "" ? null : parseInt(stockMinimo, 10) || 0,
      coste_grassocoins: coinsDesdeTexto(coinsTexto),
      visible_en_app: visibleEnApp,
      descripcion: descripcion.trim() || null,
    });
    setGuardando(false);
    if (res.ok) {
      setEditando(false);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "No se pudo guardar.");
    }
  }

  async function alternarActivo() {
    await onGuardar(producto.id, { activo: !producto.activo });
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <div className={"font-medium " + (producto.activo ? "text-stone-900" : "text-stone-400 line-through")}>
            {producto.nombre}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <span>{euros(producto.precio_centimos)}€</span>
            {producto.coste_grassocoins ? <span>· {producto.coste_grassocoins} GrassoCoins</span> : null}
            {producto.visible_en_app && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">En la tienda de la app</span>
            )}
            {producto.stock !== null && (
              <span
                className={
                  "rounded px-1.5 py-0.5 text-xs font-medium " +
                  (producto.stock_minimo !== null && producto.stock <= producto.stock_minimo
                    ? "bg-red-100 text-red-700"
                    : "bg-stone-100 text-stone-600")
                }
              >
                Stock: {producto.stock}
                {producto.stock_minimo !== null && producto.stock <= producto.stock_minimo ? " — ¡bajo!" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => setEditando(true)} className="text-brand-yellow-dark underline">
            Editar
          </button>
          <button onClick={alternarActivo} className={producto.activo ? "text-red-700 underline" : "text-green-700 underline"}>
            {producto.activo ? "Desactivar" : "Reactivar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-stone-50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="col-span-2 rounded border border-stone-300 p-2 text-sm sm:col-span-1" />
        <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio (€)" className="rounded border border-stone-300 p-2 text-sm" />
        <input value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="Orden" className="rounded border border-stone-300 p-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock (vacío = no controlar)"
          className="rounded border border-stone-300 p-2 text-sm"
        />
        <input
          value={stockMinimo}
          onChange={(e) => setStockMinimo(e.target.value)}
          placeholder="Aviso si baja de…"
          className="rounded border border-stone-300 p-2 text-sm"
        />
      </div>
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded border border-stone-300 p-2 text-sm">
        <option value="">Sin categoría</option>
        {CATEGORIAS_CONOCIDAS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <span>Precio en GrassoCoins:</span>
        <input
          value={coinsTexto}
          onChange={(e) => setCoinsTexto(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="vacío = no se canjea"
          className="w-40 rounded border border-stone-300 p-2 text-sm"
        />
        <span className="text-xs text-stone-400">
          Al 5 %: {Math.ceil((parseFloat(precio.replace(",", ".")) || 0) * 20)} coins
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={visibleEnApp} onChange={(e) => setVisibleEnApp(e.target.checked)} className="accent-brand-yellow" />
        Mostrar en la tienda de la app (los clientes lo ven con su precio y su precio en coins)
      </label>
      {visibleEnApp && (
        <div className="space-y-2 rounded border border-stone-200 bg-white p-2">
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción corta para la tienda (opcional)"
            maxLength={300}
            className="w-full rounded border border-stone-300 p-2 text-sm"
          />
          <div className="flex items-center gap-3">
            {fotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt={producto.nombre} className="h-14 w-14 rounded object-cover" />
            )}
            <input ref={inputFotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(e.target.files?.[0])} />
            <button
              type="button"
              disabled={subiendoFoto}
              onClick={() => inputFotoRef.current?.click()}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400 disabled:opacity-50"
            >
              {subiendoFoto ? "Subiendo…" : fotoUrl ? "Cambiar foto" : "Subir foto"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button disabled={guardando} onClick={guardar} className="rounded-none bg-brand-black px-3 py-1.5 text-sm font-medium text-brand-white hover:opacity-85 disabled:opacity-50 transition-opacity">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={() => setEditando(false)} className="text-sm text-stone-500 underline">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function NuevoProductoForm({ onCreado }: { onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [categoria, setCategoria] = useState("");
  const [orden, setOrden] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear() {
    if (!nombre || !precio) {
      setError("Falta al menos el nombre y el precio.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        precio_centimos: Math.round(parseFloat(precio.replace(",", ".")) * 100),
        // Nace canjeable al 5 % (20 coins por euro); se cambia al editarlo.
        coste_grassocoins: Math.ceil((parseFloat(precio.replace(",", ".")) || 0) * 20) || null,
        categoria: categoria || null,
        orden: parseInt(orden, 10) || 0,
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "No se pudo crear.");
      return;
    }
    onCreado();
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-stone-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="col-span-2 rounded border border-stone-300 p-2 text-sm sm:col-span-1" />
        <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio (€)" className="rounded border border-stone-300 p-2 text-sm" />
        <input value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="Orden" className="rounded border border-stone-300 p-2 text-sm" />
      </div>
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded border border-stone-300 p-2 text-sm">
        <option value="">Sin categoría</option>
        {CATEGORIAS_CONOCIDAS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={enviando} onClick={crear} className="rounded-none bg-brand-black px-4 py-2 text-sm font-medium text-brand-white hover:opacity-85 disabled:opacity-50 transition-opacity">
        {enviando ? "Creando…" : "Crear producto"}
      </button>
    </div>
  );
}

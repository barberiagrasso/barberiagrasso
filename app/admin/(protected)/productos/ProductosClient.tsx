"use client";

import { useState } from "react";

interface Producto {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_centimos: number;
  orden: number;
  activo: boolean;
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
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white"
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await onGuardar(producto.id, {
      nombre,
      precio_centimos: Math.round(parseFloat(precio.replace(",", ".")) * 100),
      categoria: categoria || null,
      orden: parseInt(orden, 10) || 0,
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
          <div className="text-sm text-stone-500">{euros(producto.precio_centimos)}€</div>
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
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded border border-stone-300 p-2 text-sm">
        <option value="">Sin categoría</option>
        {CATEGORIAS_CONOCIDAS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button disabled={guardando} onClick={guardar} className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink disabled:opacity-50">
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
      <button disabled={enviando} onClick={crear} className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink disabled:opacity-50">
        {enviando ? "Creando…" : "Crear producto"}
      </button>
    </div>
  );
}

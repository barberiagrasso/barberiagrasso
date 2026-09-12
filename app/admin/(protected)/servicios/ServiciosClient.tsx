"use client";

import { useState } from "react";

interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_minutos: number;
  precio_centimos: number;
  categoria: string | null;
  orden: number;
  activo: boolean;
}

// Los desplegables ya usados en la reserva, para que Diego pueda elegir
// uno existente en vez de escribirlo a mano y arriesgarse a una errata
// que cree un grupo duplicado (p. ej. "Tintes Grasso" vs "tintes grasso").
const CATEGORIAS_CONOCIDAS = [
  "Grasso Kids (hasta 7 años)",
  "Complementos",
  "Tintes Grasso",
  "Tratamientos capilares",
  "Packs Grasso",
];

function euros(centimos: number) {
  return (centimos / 100).toFixed(2);
}

export default function ServiciosClient({ servicios: inicial }: { servicios: Servicio[] }) {
  const [servicios, setServicios] = useState(inicial);
  const [creando, setCreando] = useState(false);

  async function recargar() {
    const res = await fetch("/api/admin/servicios");
    const json = await res.json();
    setServicios(json.servicios ?? []);
  }

  async function guardar(id: string, cambios: Partial<Servicio>) {
    const res = await fetch(`/api/admin/servicios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (res.ok) {
      const { servicio } = await res.json();
      setServicios((prev) => prev.map((s) => (s.id === id ? servicio : s)));
    }
    return res;
  }

  const principales = servicios.filter((s) => !s.categoria).sort((a, b) => a.orden - b.orden);
  const grupos = new Map<string, Servicio[]>();
  for (const s of servicios) {
    if (!s.categoria) continue;
    if (!grupos.has(s.categoria)) grupos.set(s.categoria, []);
    grupos.get(s.categoria)!.push(s);
  }
  for (const items of grupos.values()) items.sort((a, b) => a.orden - b.orden);

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white"
        >
          {creando ? "Cerrar" : "+ Nuevo servicio"}
        </button>
        {creando && (
          <NuevoServicioForm
            onCreado={() => {
              setCreando(false);
              recargar();
            }}
          />
        )}
      </div>

      <SeccionServicios titulo="Los 4 principales (paso de reserva)" items={principales} onGuardar={guardar} />

      {Array.from(grupos.entries()).map(([categoria, items]) => (
        <SeccionServicios key={categoria} titulo={categoria} items={items} onGuardar={guardar} />
      ))}
    </div>
  );
}

function SeccionServicios({
  titulo,
  items,
  onGuardar,
}: {
  titulo: string;
  items: Servicio[];
  onGuardar: (id: string, cambios: Partial<Servicio>) => Promise<Response>;
}) {
  return (
    <div>
      <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-stone-500">{titulo}</h2>
      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {items.map((s) => (
          <FilaServicio key={s.id} servicio={s} onGuardar={onGuardar} />
        ))}
        {items.length === 0 && <p className="p-3 text-sm text-stone-400">Sin servicios en este grupo.</p>}
      </div>
    </div>
  );
}

function FilaServicio({
  servicio,
  onGuardar,
}: {
  servicio: Servicio;
  onGuardar: (id: string, cambios: Partial<Servicio>) => Promise<Response>;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(servicio.nombre);
  const [descripcion, setDescripcion] = useState(servicio.descripcion ?? "");
  const [precio, setPrecio] = useState(euros(servicio.precio_centimos));
  const [duracion, setDuracion] = useState(String(servicio.duracion_minutos));
  const [categoria, setCategoria] = useState(servicio.categoria ?? "");
  const [orden, setOrden] = useState(String(servicio.orden));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const res = await onGuardar(servicio.id, {
      nombre,
      descripcion: descripcion || null,
      precio_centimos: Math.round(parseFloat(precio.replace(",", ".")) * 100),
      duracion_minutos: parseInt(duracion, 10),
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
    await onGuardar(servicio.id, { activo: !servicio.activo });
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <div className={"font-medium " + (servicio.activo ? "text-stone-900" : "text-stone-400 line-through")}>
            {servicio.nombre}
          </div>
          <div className="text-sm text-stone-500">
            {euros(servicio.precio_centimos)}€ · {servicio.duracion_minutos} min
            {servicio.descripcion ? ` · ${servicio.descripcion}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => setEditando(true)} className="text-brand-yellow-dark underline">
            Editar
          </button>
          <button onClick={alternarActivo} className={servicio.activo ? "text-red-700 underline" : "text-green-700 underline"}>
            {servicio.activo ? "Desactivar" : "Reactivar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-stone-50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="col-span-2 rounded border border-stone-300 p-2 text-sm sm:col-span-1" />
        <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio (€)" className="rounded border border-stone-300 p-2 text-sm" />
        <input value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="Minutos" className="rounded border border-stone-300 p-2 text-sm" />
        <input value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="Orden" className="rounded border border-stone-300 p-2 text-sm" />
      </div>
      <input
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional, ej. precio con David)"
        className="w-full rounded border border-stone-300 p-2 text-sm"
      />
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded border border-stone-300 p-2 text-sm">
        <option value="">Sin desplegable (servicio principal)</option>
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

function NuevoServicioForm({ onCreado }: { onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [duracion, setDuracion] = useState("30");
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
    const res = await fetch("/api/admin/servicios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        descripcion: descripcion || null,
        precio_centimos: Math.round(parseFloat(precio.replace(",", ".")) * 100),
        duracion_minutos: parseInt(duracion, 10) || 30,
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="col-span-2 rounded border border-stone-300 p-2 text-sm sm:col-span-1" />
        <input value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio (€)" className="rounded border border-stone-300 p-2 text-sm" />
        <input value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="Minutos" className="rounded border border-stone-300 p-2 text-sm" />
        <input value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="Orden" className="rounded border border-stone-300 p-2 text-sm" />
      </div>
      <input
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        className="w-full rounded border border-stone-300 p-2 text-sm"
      />
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded border border-stone-300 p-2 text-sm">
        <option value="">Sin desplegable (servicio principal)</option>
        {CATEGORIAS_CONOCIDAS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={enviando} onClick={crear} className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink disabled:opacity-50">
        {enviando ? "Creando…" : "Crear servicio"}
      </button>
    </div>
  );
}

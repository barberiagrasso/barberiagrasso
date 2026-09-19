"use client";

import { useState } from "react";

interface BonoTipo {
  id: string;
  clave: string;
  nombre: string;
  precio_centimos: number;
  usos_totales: number;
  dias_validez: number;
}

function euros(centimos: number) {
  return (centimos / 100).toFixed(2);
}

/**
 * Solo edición de precio: los dos tipos de bono ("Corte" y "Corte y
 * barba") son fijos, se crearon en la migración y no se pueden borrar
 * ni añadir otros desde aquí — a diferencia de Servicios/Productos, que
 * sí son un catálogo abierto. Cambiar el precio aquí NO afecta a bonos
 * ya vendidos (cada uno guarda su propio precio pagado, ver
 * comprarBono en lib/bonos.ts): solo se aplica a las próximas ventas.
 */
export default function BonosClient({ tipos: inicial }: { tipos: BonoTipo[] }) {
  const [tipos, setTipos] = useState(inicial);

  async function guardar(id: string, precioCentimos: number) {
    const res = await fetch(`/api/admin/bonos-tipos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ precio_centimos: precioCentimos }),
    });
    if (res.ok) {
      const { tipo } = await res.json();
      setTipos((prev) => prev.map((t) => (t.id === id ? tipo : t)));
    }
    return res;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Bonos de 4 usos que se venden en el propio local (nunca desde la app) y valen en cualquiera de las dos sedes
        durante 30 días desde la compra. Aquí solo se cambia el precio de venta — no afecta a los bonos que ya tenga
        algún cliente.
      </p>
      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {tipos.map((t) => (
          <FilaBonoTipo key={t.id} tipo={t} onGuardar={guardar} />
        ))}
        {tipos.length === 0 && <p className="p-3 text-sm text-stone-400">No se encontraron tipos de bono.</p>}
      </div>
    </div>
  );
}

function FilaBonoTipo({
  tipo,
  onGuardar,
}: {
  tipo: BonoTipo;
  onGuardar: (id: string, precioCentimos: number) => Promise<Response>;
}) {
  const [editando, setEditando] = useState(false);
  const [precio, setPrecio] = useState(euros(tipo.precio_centimos));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const centimos = Math.round(parseFloat(precio.replace(",", ".")) * 100);
    if (!Number.isFinite(centimos) || centimos < 0) {
      setError("Precio no válido.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await onGuardar(tipo.id, centimos);
    setGuardando(false);
    if (res.ok) {
      setEditando(false);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "No se pudo guardar.");
    }
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <div className="font-medium text-stone-900">{tipo.nombre}</div>
          <div className="text-sm text-stone-500">
            {euros(tipo.precio_centimos)}€ · {tipo.usos_totales} usos · caduca a los {tipo.dias_validez} días
          </div>
        </div>
        <button onClick={() => setEditando(true)} className="text-xs text-brand-yellow-dark underline">
          Editar precio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-stone-50 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-stone-900">{tipo.nombre}</span>
        <input
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="Precio (€)"
          className="w-28 rounded border border-stone-300 p-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          disabled={guardando}
          onClick={guardar}
          className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={() => setEditando(false)} className="text-sm text-stone-500 underline">
          Cancelar
        </button>
      </div>
    </div>
  );
}

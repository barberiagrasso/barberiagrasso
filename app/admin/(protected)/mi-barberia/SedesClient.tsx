"use client";

import { useState } from "react";

interface Sede {
  id: string;
  nombre: string;
  acepta_tarjeta: boolean;
  acceso_movilidad_reducida: boolean;
  wifi: boolean;
  apto_ninos: boolean;
}

const CASILLAS: { clave: keyof Omit<Sede, "id" | "nombre">; label: string }[] = [
  { clave: "acepta_tarjeta", label: "Se aceptan tarjetas" },
  { clave: "acceso_movilidad_reducida", label: "Acceso para movilidad reducida" },
  { clave: "wifi", label: "Wifi" },
  { clave: "apto_ninos", label: "Apto para niños" },
];

/**
 * Checklist de "normas y servicios del local" por sede, inspirado en la
 * ficha de negocio de Booksy (pedido de Diego 19/10/2026): se marcan
 * aquí y se muestran al cliente en el paso "Elige tu sede" de /reservar,
 * como un pequeño sello de confianza más. Cada casilla guarda en cuanto
 * se toca, sin botón de "Guardar" aparte — son pocos datos y el cambio
 * es inmediato.
 */
export default function SedesClient({ sedes: inicial }: { sedes: Sede[] }) {
  const [sedes, setSedes] = useState(inicial);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function alternar(sedeId: string, clave: keyof Omit<Sede, "id" | "nombre">, valor: boolean) {
    setSedes((prev) => prev.map((s) => (s.id === sedeId ? { ...s, [clave]: valor } : s)));
    setGuardandoId(sedeId);
    setErrorId(null);
    const res = await fetch(`/api/admin/sedes/${sedeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [clave]: valor }),
    });
    setGuardandoId(null);
    if (!res.ok) {
      // Revierte si falló el guardado, para que la casilla no mienta.
      setSedes((prev) => prev.map((s) => (s.id === sedeId ? { ...s, [clave]: !valor } : s)));
      setErrorId(sedeId);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Estas casillas se muestran al cliente al elegir sede en la reserva, como ficha de confianza del local
        (igual que hace Booksy con sus negocios). No afectan a nada más.
      </p>
      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {sedes.map((sede) => (
          <div key={sede.id} className="p-3">
            <div className="mb-2 font-medium text-stone-900">{sede.nombre}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CASILLAS.map((c) => (
                <label key={c.clave} className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    className="accent-brand-yellow-dark"
                    checked={sede[c.clave]}
                    disabled={guardandoId === sede.id}
                    onChange={(e) => alternar(sede.id, c.clave, e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            {errorId === sede.id && <p className="mt-1 text-xs text-red-600">No se pudo guardar, inténtalo otra vez.</p>}
          </div>
        ))}
        {sedes.length === 0 && <p className="p-3 text-sm text-stone-400">No se encontraron sedes.</p>}
      </div>
    </div>
  );
}

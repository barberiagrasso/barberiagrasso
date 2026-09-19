"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";

interface OpcionProfesional {
  id: string;
  nombre: string;
  foto_url?: string | null;
}

/**
 * Sustituto de un <select> nativo para elegir un barbero, mostrando su
 * foto de perfil junto al nombre — un <option> normal no puede pintar una
 * imagen, así que se rehace como un menú propio. Pedido de Diego
 * (19/09/2026): la foto debe aparecer en TODOS los sitios del panel donde
 * se elige o se muestra un barbero, incluidos estos desplegables.
 */
export function SelectorProfesionalConFoto({
  value,
  onChange,
  opciones,
  etiquetaVacio = "Cualquiera",
  ocultarOpcionVacia = false,
  className = "",
}: {
  value: string;
  onChange: (id: string) => void;
  opciones: OpcionProfesional[];
  etiquetaVacio?: string;
  /** Para un campo obligatorio (p.ej. "quién hizo la cita") donde no tiene sentido poder dejarlo sin elegir. */
  ocultarOpcionVacia?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const elegido = opciones.find((o) => o.id === value) ?? null;

  return (
    <div ref={ref} className={"relative " + className}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-stone-300 bg-white p-2 text-left text-sm text-stone-700"
      >
        {elegido ? (
          <AvatarProfesional fotoUrl={elegido.foto_url} nombre={elegido.nombre} className="h-6 w-6" />
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-stone-300" />
        )}
        <span className="flex-1 truncate">{elegido?.nombre ?? etiquetaVacio}</span>
        <span className="shrink-0 text-stone-400">▾</span>
      </button>
      {abierto && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {!ocultarOpcionVacia && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setAbierto(false);
              }}
              className={
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-stone-50 " +
                (value === "" ? "bg-stone-50 font-medium text-stone-900" : "text-stone-700")
              }
            >
              <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-stone-300" />
              {etiquetaVacio}
            </button>
          )}
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setAbierto(false);
              }}
              className={
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-stone-50 " +
                (value === o.id ? "bg-stone-50 font-medium text-stone-900" : "text-stone-700")
              }
            >
              <AvatarProfesional fotoUrl={o.foto_url} nombre={o.nombre} className="h-6 w-6" />
              {o.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

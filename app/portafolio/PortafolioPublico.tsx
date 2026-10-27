"use client";

import { useMemo, useState } from "react";
import { GaleriaTrabajos } from "@/components/portafolio/GaleriaTrabajos";

interface Foto {
  id: string;
  url: string;
  servicio_id: string | null;
  sede_id: string | null;
  descripcion: string | null;
}
interface Opcion {
  id: string;
  nombre: string;
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 rounded-full border px-3 py-1.5 font-body text-xs transition-colors " +
        (activo
          ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
          : "border-brand-line text-brand-white hover:border-brand-yellow/60")
      }
    >
      {children}
    </button>
  );
}

export default function PortafolioPublico({
  fotos,
  servicios,
  sedes,
}: {
  fotos: Foto[];
  servicios: Opcion[];
  sedes: Opcion[];
}) {
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [sedeId, setSedeId] = useState<string | null>(null);

  // Solo se ofrecen como filtro los servicios y sedes que tienen fotos.
  const serviciosConFotos = useMemo(
    () => servicios.filter((s) => fotos.some((f) => f.servicio_id === s.id)),
    [servicios, fotos],
  );
  const sedesConFotos = useMemo(() => sedes.filter((s) => fotos.some((f) => f.sede_id === s.id)), [sedes, fotos]);

  const visibles = fotos.filter(
    // Una foto sin sede es de las dos, así que sale al filtrar por cualquiera.
    (f) => (!servicioId || f.servicio_id === servicioId) && (!sedeId || !f.sede_id || f.sede_id === sedeId),
  );

  if (fotos.length === 0) {
    return <p className="font-body text-sm text-brand-white-dim">Muy pronto podrás ver aquí nuestros trabajos.</p>;
  }

  return (
    <div className="space-y-4">
      {serviciosConFotos.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip activo={servicioId === null} onClick={() => setServicioId(null)}>
            Todos
          </Chip>
          {serviciosConFotos.map((s) => (
            <Chip key={s.id} activo={servicioId === s.id} onClick={() => setServicioId(s.id)}>
              {s.nombre}
            </Chip>
          ))}
        </div>
      )}
      {sedesConFotos.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip activo={sedeId === null} onClick={() => setSedeId(null)}>
            Las dos sedes
          </Chip>
          {sedesConFotos.map((s) => (
            <Chip key={s.id} activo={sedeId === s.id} onClick={() => setSedeId(s.id)}>
              {s.nombre}
            </Chip>
          ))}
        </div>
      )}
      {visibles.length === 0 ? (
        <p className="font-body text-sm text-brand-white-dim">No hay fotos con este filtro.</p>
      ) : (
        <GaleriaTrabajos key={`${servicioId}-${sedeId}`} fotos={visibles} />
      )}
    </div>
  );
}

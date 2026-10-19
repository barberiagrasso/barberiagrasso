"use client";

interface Entrada {
  id: string;
  admin_nombre: string;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: unknown;
  created_at: string;
}

const ETIQUETA_ACCION: Record<string, string> = {
  cancelar_cita: "Canceló la cita",
  "estado:completada": "Marcó la cita como completada",
  "estado:no_presentada": "Marcó la cita como no presentada",
  "estado:confirmada": "Reactivó la cita",
  mover_cita: "Movió la cita de hora",
};

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AuditoriaClient({ entradas }: { entradas: Entrada[] }) {
  return (
    <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {entradas.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <div>
            <span className="font-medium text-stone-900">{e.admin_nombre}</span>
            <span className="text-stone-500"> — {ETIQUETA_ACCION[e.accion] ?? e.accion}</span>
          </div>
          <span className="text-xs text-stone-400">{formatoFecha(e.created_at)}</span>
        </div>
      ))}
      {entradas.length === 0 && <p className="p-3 text-sm text-stone-400">Todavía no hay nada registrado.</p>}
    </div>
  );
}

"use client";

import { useState } from "react";

interface ErrorFila {
  id: string;
  origen: string;
  mensaje: string;
  detalle: string | null;
  created_at: string;
  resuelto_at?: string | null;
}

const ETIQUETA_ORIGEN: Record<string, string> = {
  reserva: "Reserva",
  cancelacion: "Cancelación",
  webhook_whatsapp: "WhatsApp",
  cron_recordatorios: "Recordatorios",
  cron_retencion: "Retención",
  cron_backup: "Copia de seguridad",
  fidelizacion: "Fidelización",
  aviso_disponibilidad: "Aviso de disponibilidad",
  recuperacion_password: "Recuperación de contraseña",
  aviso_alta: "Aviso de alta de cliente",
  servidor: "Servidor",
};

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default function ErroresClient({
  sinResolver,
  resueltosRecientes,
}: {
  sinResolver: ErrorFila[];
  resueltosRecientes: ErrorFila[];
}) {
  const [pendientes, setPendientes] = useState(sinResolver);
  const [resueltos, setResueltos] = useState(resueltosRecientes);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  async function marcarResuelto(id: string) {
    setMarcando(id);
    const res = await fetch(`/api/admin/errores/${id}`, { method: "PATCH" });
    setMarcando(null);
    if (!res.ok) return;
    const fila = pendientes.find((e) => e.id === id);
    setPendientes((prev) => prev.filter((e) => e.id !== id));
    if (fila) setResueltos((prev) => [{ ...fila, resuelto_at: new Date().toISOString() }, ...prev]);
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Sin resolver ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">
            No hay ningún error pendiente. Todo en orden.
          </p>
        ) : (
          <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {pendientes.map((e) => (
              <div key={e.id} className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
                        {ETIQUETA_ORIGEN[e.origen] ?? e.origen}
                      </span>
                      <span className="text-stone-400">{formatoFecha(e.created_at)}</span>
                    </div>
                    <button
                      onClick={() => setAbiertoId(abiertoId === e.id ? null : e.id)}
                      className="mt-1 text-left text-sm text-stone-800 hover:underline"
                    >
                      {e.mensaje}
                    </button>
                    {abiertoId === e.id && e.detalle && (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-stone-50 p-2 text-xs text-stone-600">
                        {e.detalle}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => marcarResuelto(e.id)}
                    disabled={marcando === e.id}
                    className="shrink-0 rounded-lg border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    Marcar resuelto
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Resueltos recientemente</h2>
        {resueltos.length === 0 ? (
          <p className="text-sm text-stone-400">Todavía no has resuelto ninguno.</p>
        ) : (
          <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white opacity-70">
            {resueltos.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="text-stone-600">
                  <span className="mr-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                    {ETIQUETA_ORIGEN[e.origen] ?? e.origen}
                  </span>
                  {e.mensaje}
                </span>
                <span className="text-xs text-stone-400">{formatoFecha(e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { Insignia } from "@/components/ui/Insignia";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

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
          <EstadoVacio titulo="No hay ningún error pendiente" descripcion="Todo en orden." />
        ) : (
          <Tarjeta sinRelleno className="divide-y divide-stone-100">
            {pendientes.map((e) => (
              <div key={e.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Insignia variante="error">{ETIQUETA_ORIGEN[e.origen] ?? e.origen}</Insignia>
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
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => marcarResuelto(e.id)}
                    disabled={marcando === e.id}
                    className="shrink-0"
                  >
                    Marcar resuelto
                  </Boton>
                </div>
              </div>
            ))}
          </Tarjeta>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Resueltos recientemente</h2>
        {resueltos.length === 0 ? (
          <p className="text-sm text-stone-400">Todavía no has resuelto ninguno.</p>
        ) : (
          <Tarjeta sinRelleno className="divide-y divide-stone-100 opacity-70">
            {resueltos.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span className="text-stone-600">
                  <Insignia variante="neutral" className="mr-2">
                    {ETIQUETA_ORIGEN[e.origen] ?? e.origen}
                  </Insignia>
                  {e.mensaje}
                </span>
                <span className="text-xs text-stone-400">{formatoFecha(e.created_at)}</span>
              </div>
            ))}
          </Tarjeta>
        )}
      </section>
    </div>
  );
}

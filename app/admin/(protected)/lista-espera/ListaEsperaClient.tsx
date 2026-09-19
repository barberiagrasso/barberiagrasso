"use client";

import { useEffect, useMemo, useState } from "react";
import { etiquetaFlexibilidad } from "@/lib/listaEspera";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";

interface Sede {
  id: string;
  nombre: string;
}
type Estado = "pendiente" | "notificado";
interface Entrada {
  id: string;
  fecha: string;
  flexibilidad_dias: number;
  estado: Estado;
  created_at: string;
  cliente: { nombre: string; telefono: string | null } | { nombre: string; telefono: string | null }[] | null;
  servicio: { nombre: string } | { nombre: string }[] | null;
  profesional: { nombre: string; foto_url?: string | null } | { nombre: string; foto_url?: string | null }[] | null;
}

function uno<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function formatoFechaLarga(fechaISO: string) {
  const texto = new Date(`${fechaISO}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Madrid",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatoFechaAlta(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });
}

const ETIQUETA_ESTADO: Record<Estado, string> = { pendiente: "Pendiente", notificado: "Notificado" };

/**
 * Pestaña "Lista de espera" del panel: las entradas de quien sigue
 * esperando un hueco, agrupadas por día como una segunda agenda. La
 * asignación en sí es automática (ver lib/booking.ts,
 * asignarListaEsperaPorHueco) — esta pantalla es solo para ver quién
 * está esperando y, si hace falta, quitar a alguien a mano.
 */
export default function ListaEsperaClient({ sedes }: { sedes: Sede[] }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [quitando, setQuitando] = useState<string | null>(null);

  async function cargar() {
    if (!sedeId) return;
    setCargando(true);
    const res = await fetch(`/api/admin/lista-espera?sedeId=${sedeId}`);
    const json = await res.json();
    setEntradas(json.entradas ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Entrada[]>();
    for (const e of entradas) {
      if (!mapa.has(e.fecha)) mapa.set(e.fecha, []);
      mapa.get(e.fecha)!.push(e);
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [entradas]);

  async function quitar(id: string) {
    if (!confirm("¿Quitar a este cliente de la lista de espera?")) return;
    setQuitando(id);
    await fetch(`/api/admin/lista-espera/${id}`, { method: "DELETE" });
    setQuitando(null);
    cargar();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {sedes.map((s) => (
          <button
            key={s.id}
            onClick={() => setSedeId(s.id)}
            className={
              "rounded-lg border px-3 py-2 text-sm " +
              (sedeId === s.id
                ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-400")
            }
          >
            {s.nombre}
          </button>
        ))}
      </div>

      {cargando && <p className="text-sm text-stone-400">Cargando…</p>}
      {!cargando && grupos.length === 0 && (
        <p className="text-sm text-stone-400">Nadie está esperando un hueco en esta sede ahora mismo.</p>
      )}

      <div className="space-y-5">
        {grupos.map(([fecha, entradasDelDia]) => (
          <div key={fecha}>
            <h2 className="mb-2 text-sm font-semibold text-stone-800">{formatoFechaLarga(fecha)}</h2>
            <div className="space-y-2">
              {entradasDelDia.map((e) => {
                const cliente = uno(e.cliente);
                const servicio = uno(e.servicio);
                const profesional = uno(e.profesional);
                return (
                  <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-2.5 text-sm">
                    <div>
                      <p className="font-medium text-stone-900">{cliente?.nombre ?? "Cliente"}</p>
                      <p className="flex items-center gap-1 text-xs text-stone-500">
                        {profesional && <AvatarProfesional fotoUrl={profesional.foto_url} nombre={profesional.nombre} className="h-4 w-4" />}
                        <span>
                          {cliente?.telefono && `${cliente.telefono} · `}
                          {servicio?.nombre ?? "Servicio"} · {profesional?.nombre ?? "Cualquiera"}
                        </span>
                      </p>
                      <p className="text-xs text-stone-400">
                        Le vale {etiquetaFlexibilidad(e.flexibilidad_dias)} · apuntado el {formatoFechaAlta(e.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs " +
                          (e.estado === "notificado" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")
                        }
                      >
                        {ETIQUETA_ESTADO[e.estado]}
                      </span>
                      <button
                        onClick={() => quitar(e.id)}
                        disabled={quitando === e.id}
                        className="text-xs text-stone-500 underline disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

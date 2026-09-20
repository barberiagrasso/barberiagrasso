"use client";

import { useEffect, useState } from "react";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";
import { SelectorProfesionalConFoto } from "@/components/admin/SelectorProfesionalConFoto";

interface Sede {
  id: string;
  nombre: string;
}
interface Profesional {
  id: string;
  nombre: string;
  foto_url?: string | null;
}
interface Bloqueo {
  id: string;
  profesional_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
  profesional: { nombre: string; foto_url?: string | null } | null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
  });
}

export default function BloqueosClient({ sedes }: { sedes: Sede[] }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [cargando, setCargando] = useState(false);

  const [profesionalId, setProfesionalId] = useState(""); // "" = toda la sede
  const [fecha, setFecha] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cargarBloqueos() {
    if (!sedeId) return;
    setCargando(true);
    const res = await fetch(`/api/admin/bloqueos?sedeId=${sedeId}`);
    const json = await res.json();
    setBloqueos(json.bloqueos ?? []);
    setCargando(false);
  }

  useEffect(() => {
    if (!sedeId) return;
    fetch(`/api/profesionales?sedeId=${sedeId}`)
      .then((r) => r.json())
      .then((j) => setProfesionales(j.profesionales ?? []));
    void cargarBloqueos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  async function crearBloqueo() {
    setError(null);
    setEnviando(true);
    const res = await fetch("/api/admin/bloqueos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sedeId,
        profesionalId: profesionalId || null,
        fecha,
        fechaFin,
        motivo,
      }),
    });
    const json = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(json.error || "No se pudo crear el bloqueo.");
      return;
    }
    setMotivo("");
    cargarBloqueos();
  }

  async function eliminarBloqueo(id: string) {
    await fetch(`/api/admin/bloqueos/${id}`, { method: "DELETE" });
    cargarBloqueos();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
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

      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-medium text-stone-800">Nuevo bloqueo</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectorProfesionalConFoto
            value={profesionalId}
            onChange={setProfesionalId}
            opciones={profesionales}
            etiquetaVacio="Toda la sede (festivo, cierre...)"
          />
          <input
            placeholder="Motivo (opcional): vacaciones, médico…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="rounded-lg border border-stone-300 p-2 text-sm"
          />
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span>Desde</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-lg border border-stone-300 p-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span>Hasta</span>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="rounded-lg border border-stone-300 p-2 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-stone-400">
          Para bloquear un único día, pon la misma fecha en &quot;Desde&quot; y
          &quot;Hasta&quot;. El bloqueo cubre el día completo (no hace falta
          indicar horas).
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={enviando}
          onClick={crearBloqueo}
          className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
        >
          {enviando ? "Guardando…" : "Crear bloqueo"}
        </button>
      </div>

      <div>
        <h2 className="mb-2 font-medium text-stone-800">
          Próximos bloqueos en esta sede
        </h2>
        {cargando && <p className="text-sm text-stone-500">Cargando…</p>}
        <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {bloqueos.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <div className="flex items-center gap-1.5 font-medium text-stone-900">
                  {b.profesional && (
                    <AvatarProfesional
                      fotoUrl={b.profesional.foto_url}
                      nombre={b.profesional.nombre}
                      className="h-5 w-5"
                    />
                  )}
                  {b.profesional?.nombre ?? "Toda la sede"}
                </div>
                <div className="text-sm text-stone-500">
                  {formatoFecha(b.fecha_inicio)} — {formatoFecha(b.fecha_fin)}
                  {b.motivo ? ` · ${b.motivo}` : ""}
                </div>
              </div>
              <button
                onClick={() => eliminarBloqueo(b.id)}
                className="text-xs text-red-700 underline"
              >
                Eliminar
              </button>
            </div>
          ))}
          {!cargando && bloqueos.length === 0 && (
            <p className="p-3 text-sm text-stone-500">
              No hay bloqueos próximos en esta sede.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

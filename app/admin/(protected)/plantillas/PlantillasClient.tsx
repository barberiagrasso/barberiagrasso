"use client";

import { useEffect, useState } from "react";

interface Plantilla {
  id: string;
  tipo: "recordatorio" | "campana";
  nombre: string;
  nombre_meta: string;
  idioma: string;
  variables: string[];
  activa: boolean;
}

export default function PlantillasClient() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [creando, setCreando] = useState(false);

  async function cargar() {
    const res = await fetch("/api/admin/plantillas");
    const json = await res.json();
    setPlantillas(json.plantillas ?? []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function alternarActiva(p: Plantilla) {
    await fetch(`/api/admin/plantillas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !p.activa }),
    });
    cargar();
  }

  async function eliminar(p: Plantilla) {
    await fetch(`/api/admin/plantillas/${p.id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setCreando((v) => !v)} className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white">
        {creando ? "Cerrar" : "+ Registrar plantilla aprobada"}
      </button>
      {creando && (
        <NuevaPlantillaForm
          onCreada={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}

      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {plantillas.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <div className="font-medium text-stone-900">
                {p.nombre} <span className="font-mono text-xs text-stone-400">({p.tipo})</span>
              </div>
              <div className="text-sm text-stone-500">
                Meta: <code>{p.nombre_meta}</code> · {p.idioma}
                {p.variables.length > 0 ? ` · variables: ${p.variables.join(", ")}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => alternarActiva(p)} className={p.activa ? "text-red-700 underline" : "text-green-700 underline"}>
                {p.activa ? "Desactivar" : "Activar"}
              </button>
              <button onClick={() => eliminar(p)} className="text-stone-500 underline">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {plantillas.length === 0 && (
          <p className="p-4 text-sm text-stone-500">
            Todavía no has registrado ninguna plantilla. Regístrala aquí en cuanto Meta te apruebe una.
          </p>
        )}
      </div>
    </div>
  );
}

function NuevaPlantillaForm({ onCreada }: { onCreada: () => void }) {
  const [tipo, setTipo] = useState<"recordatorio" | "campana">("recordatorio");
  const [nombre, setNombre] = useState("");
  const [nombreMeta, setNombreMeta] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [variables, setVariables] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear() {
    if (!nombre || !nombreMeta) {
      setError("Falta el nombre interno o el nombre exacto de Meta.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin/plantillas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        nombre,
        nombre_meta: nombreMeta,
        idioma,
        variables: variables.split(",").map((v) => v.trim()).filter(Boolean),
      }),
    });
    setEnviando(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "No se pudo crear.");
      return;
    }
    onCreada();
  }

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-4">
      <select value={tipo} onChange={(e) => setTipo(e.target.value as "recordatorio" | "campana")} className="w-full rounded border border-stone-300 p-2 text-sm">
        <option value="recordatorio">Recordatorio de cita</option>
        <option value="campana">Campaña comercial</option>
      </select>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre para reconocerla en el panel" className="w-full rounded border border-stone-300 p-2 text-sm" />
      <input
        value={nombreMeta}
        onChange={(e) => setNombreMeta(e.target.value)}
        placeholder="Nombre EXACTO de la plantilla en Meta Business Manager"
        className="w-full rounded border border-stone-300 p-2 text-sm"
      />
      <div className="flex gap-2">
        <input value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="Idioma (es)" className="w-24 rounded border border-stone-300 p-2 text-sm" />
        <input
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          placeholder="Variables en orden, separadas por comas (ej: nombre, hora)"
          className="flex-1 rounded border border-stone-300 p-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={enviando} onClick={crear} className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink disabled:opacity-50">
        {enviando ? "Guardando…" : "Guardar plantilla"}
      </button>
    </div>
  );
}

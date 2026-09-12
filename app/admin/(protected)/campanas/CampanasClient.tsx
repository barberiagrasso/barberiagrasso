"use client";

import { useEffect, useState } from "react";

interface Sede {
  id: string;
  nombre: string;
}
interface Plantilla {
  id: string;
  nombre: string;
  activa: boolean;
}
interface Campana {
  id: string;
  nombre: string;
  mensaje: string;
  estado: "borrador" | "enviando" | "enviada" | "fallida";
  plantilla: { nombre: string; nombre_meta: string; activa: boolean } | null;
  destinatarios: { total: number; enviados: number; fallidos: number };
  created_at: string;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  enviando: "Enviando…",
  enviada: "Enviada",
  fallida: "Con errores",
};

export default function CampanasClient({ sedes, plantillas }: { sedes: Sede[]; plantillas: Plantilla[] }) {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [creando, setCreando] = useState(false);

  async function cargar() {
    const res = await fetch("/api/admin/campanas");
    const json = await res.json();
    setCampanas(json.campanas ?? []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function enviar(id: string) {
    if (!confirm("¿Enviar esta campaña ahora a todos sus destinatarios? No se puede deshacer.")) return;
    const res = await fetch(`/api/admin/campanas/${id}/enviar`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "No se pudo enviar.");
    }
    cargar();
  }

  return (
    <div className="space-y-6">
      <button onClick={() => setCreando((v) => !v)} className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white">
        {creando ? "Cerrar" : "+ Nueva campaña"}
      </button>
      {creando && (
        <NuevaCampanaForm
          sedes={sedes}
          plantillas={plantillas}
          onCreada={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}

      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {campanas.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-medium text-stone-900">{c.nombre}</div>
              <div className="max-w-md text-sm text-stone-500">{c.mensaje}</div>
              <div className="mt-1 text-xs text-stone-400">
                {c.destinatarios.total} destinatarios
                {c.destinatarios.enviados > 0 ? ` · ${c.destinatarios.enviados} enviados` : ""}
                {c.destinatarios.fallidos > 0 ? ` · ${c.destinatarios.fallidos} fallidos` : ""}
                {c.plantilla ? ` · plantilla: ${c.plantilla.nombre}` : " · sin plantilla asignada"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-700">{ETIQUETA_ESTADO[c.estado]}</span>
              {c.estado === "borrador" && (
                <button
                  disabled={!c.plantilla || !c.plantilla.activa}
                  onClick={() => enviar(c.id)}
                  title={!c.plantilla ? "Asigna una plantilla aprobada antes de enviar" : undefined}
                  className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Enviar ahora
                </button>
              )}
              {c.estado === "fallida" && (
                <button onClick={() => enviar(c.id)} className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink">
                  Reintentar pendientes
                </button>
              )}
            </div>
          </div>
        ))}
        {campanas.length === 0 && <p className="p-4 text-sm text-stone-500">Todavía no has creado ninguna campaña.</p>}
      </div>
    </div>
  );
}

function NuevaCampanaForm({
  sedes,
  plantillas,
  onCreada,
}: {
  sedes: Sede[];
  plantillas: Plantilla[];
  onCreada: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [sedeHabitualId, setSedeHabitualId] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [sinVisitasDesde, setSinVisitasDesde] = useState("");
  const [plantillaId, setPlantillaId] = useState(plantillas[0]?.id ?? "");
  const [preview, setPreview] = useState<{ total: number; muestra: string[] } | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function segmentoActual() {
    return {
      sedeHabitualId: sedeHabitualId || null,
      etiqueta: etiqueta || null,
      sinVisitasDesde: sinVisitasDesde || null,
    };
  }

  async function previsualizar() {
    setConsultando(true);
    const res = await fetch("/api/admin/campanas/segmento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(segmentoActual()),
    });
    const json = await res.json();
    setPreview(json);
    setConsultando(false);
  }

  async function crear() {
    if (!nombre || !mensaje) {
      setError("Falta el nombre o el mensaje.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin/campanas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, mensaje, segmento: segmentoActual(), plantillaId: plantillaId || null }),
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
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la campaña (uso interno)" className="w-full rounded border border-stone-300 p-2 text-sm" />
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        placeholder="Mensaje que quieres mandar"
        rows={3}
        className="w-full rounded border border-stone-300 p-2 text-sm"
      />

      <div>
        <h3 className="mb-1 text-sm font-medium text-stone-700">Segmento</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={sedeHabitualId} onChange={(e) => setSedeHabitualId(e.target.value)} className="rounded border border-stone-300 p-2 text-sm">
            <option value="">Cualquier sede habitual</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Etiqueta (opcional)" className="rounded border border-stone-300 p-2 text-sm" />
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span>Sin visitas desde</span>
            <input type="date" value={sinVisitasDesde} onChange={(e) => setSinVisitasDesde(e.target.value)} className="rounded border border-stone-300 p-2 text-sm" />
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-400">
          Solo se incluye a clientes con el consentimiento comercial marcado como &quot;Sí, acepta&quot; en el
          CRM, aunque no lo indiques aquí.
        </p>
        <button onClick={previsualizar} disabled={consultando} className="mt-2 text-sm text-brand-yellow-dark underline disabled:opacity-50">
          {consultando ? "Calculando…" : "Ver a cuántos llegaría"}
        </button>
        {preview && (
          <p className="mt-1 text-sm text-stone-600">
            Llegaría a <strong>{preview.total}</strong> clientes
            {preview.muestra.length > 0 ? ` (ej: ${preview.muestra.join(", ")}${preview.total > preview.muestra.length ? "…" : ""})` : ""}.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-stone-700">Plantilla de WhatsApp</h3>
        {plantillas.length === 0 ? (
          <p className="text-sm text-amber-700">
            Todavía no tienes ninguna plantilla de campaña registrada en /admin/plantillas. Puedes
            guardar la campaña como borrador y asignarle una plantilla más adelante.
          </p>
        ) : (
          <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} className="w-full rounded border border-stone-300 p-2 text-sm">
            {plantillas.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.activa}>
                {p.nombre}
                {!p.activa ? " (desactivada)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={enviando} onClick={crear} className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink disabled:opacity-50">
        {enviando ? "Guardando…" : "Guardar como borrador"}
      </button>
    </div>
  );
}

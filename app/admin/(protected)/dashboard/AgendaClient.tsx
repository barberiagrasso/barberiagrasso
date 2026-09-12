"use client";

import { useEffect, useState } from "react";

interface Sede {
  id: string;
  nombre: string;
  slug: string;
}
interface Servicio {
  id: string;
  nombre: string;
  duracion_minutos: number;
  precio_centimos: number;
}
interface Cita {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  origen: string;
  cliente: { id: string; nombre: string; telefono: string } | null;
  servicio: { id: string; nombre: string } | null;
  profesional: { id: string; nombre: string } | null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatoHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  no_presentada: "No presentada",
};

export default function AgendaClient({ sedes, servicios }: { sedes: Sede[]; servicios: Servicio[] }) {
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoyISO());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);

  async function cargarCitas() {
    if (!sedeId) return;
    setCargando(true);
    const res = await fetch(`/api/admin/citas?sedeId=${sedeId}&fecha=${fecha}`);
    const json = await res.json();
    setCitas(json.citas ?? []);
    setCargando(false);
  }

  useEffect(() => {
    void cargarCitas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId, fecha]);

  async function cambiarEstado(id: string, estado: string) {
    await fetch(`/api/admin/citas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    cargarCitas();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-lg border border-stone-300 p-2 text-sm"
        />
        <button
          onClick={() => setMostrarNueva((v) => !v)}
          className="ml-auto rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white"
        >
          {mostrarNueva ? "Cerrar" : "+ Nueva cita"}
        </button>
      </div>

      {mostrarNueva && (
        <NuevaCitaForm
          sedeId={sedeId}
          fecha={fecha}
          servicios={servicios}
          onCreada={() => {
            setMostrarNueva(false);
            cargarCitas();
          }}
        />
      )}

      {cargando && <p className="text-sm text-stone-500">Cargando…</p>}
      {!cargando && citas.length === 0 && (
        <p className="text-sm text-stone-500">No hay citas ese día en esta sede.</p>
      )}

      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
        {citas.map((cita) => (
          <div key={cita.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-medium text-stone-900">
                {formatoHora(cita.inicio)} · {cita.cliente?.nombre ?? "Cliente"}
              </div>
              <div className="text-sm text-stone-500">
                {cita.servicio?.nombre} · {cita.profesional?.nombre} · {cita.cliente?.telefono}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  "rounded-full px-2 py-1 text-xs " +
                  (cita.estado === "cancelada"
                    ? "bg-red-100 text-red-700"
                    : cita.estado === "completada"
                    ? "bg-green-100 text-green-700"
                    : "bg-stone-100 text-stone-700")
                }
              >
                {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
              </span>
              {cita.estado === "confirmada" && (
                <>
                  <button
                    onClick={() => cambiarEstado(cita.id, "completada")}
                    className="text-xs text-green-700 underline"
                  >
                    Completada
                  </button>
                  <button
                    onClick={() => cambiarEstado(cita.id, "no_presentada")}
                    className="text-xs text-amber-700 underline"
                  >
                    No presentada
                  </button>
                  <button
                    onClick={() => cambiarEstado(cita.id, "cancelada")}
                    className="text-xs text-red-700 underline"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NuevaCitaForm({
  sedeId,
  fecha,
  servicios,
  onCreada,
}: {
  sedeId: string;
  fecha: string;
  servicios: Servicio[];
  onCreada: () => void;
}) {
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [profesionales, setProfesionales] = useState<{ id: string; nombre: string }[]>([]);
  const [profesionalId, setProfesionalId] = useState("");
  const [slots, setSlots] = useState<{ hora_inicio: string; profesional_id: string; profesional_nombre: string }[]>(
    []
  );
  const [horaInicioISO, setHoraInicioISO] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!servicioId || !sedeId) return;
    fetch(`/api/profesionales?sedeId=${sedeId}&servicioId=${servicioId}`)
      .then((r) => r.json())
      .then((j) => setProfesionales(j.profesionales ?? []));
  }, [servicioId, sedeId]);

  useEffect(() => {
    if (!servicioId || !sedeId || !fecha) return;
    const p = new URLSearchParams({ sedeId, servicioId, fecha });
    if (profesionalId) p.set("profesionalId", profesionalId);
    fetch(`/api/disponibilidad?${p.toString()}`)
      .then((r) => r.json())
      .then((j) => setSlots(j.slots ?? []));
  }, [servicioId, sedeId, fecha, profesionalId]);

  async function crear() {
    if (!horaInicioISO || !nombre || !telefono) return;
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sedeId,
        servicioId,
        profesionalId: profesionalId || undefined,
        fecha,
        horaInicioISO,
        cliente: { nombre, telefono },
        aceptaComercial: false,
      }),
    });
    const json = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(json.error || "No se pudo crear la cita.");
      return;
    }
    onCreada();
  }

  const horasUnicas = Array.from(new Map(slots.map((s) => [s.hora_inicio, s])).values());

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <select value={servicioId} onChange={(e) => setServicioId(e.target.value)} className="rounded-lg border border-stone-300 p-2 text-sm">
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className="rounded-lg border border-stone-300 p-2 text-sm">
          <option value="">Cualquier profesional</option>
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {horasUnicas.map((s) => (
          <button
            key={s.hora_inicio}
            onClick={() => setHoraInicioISO(s.hora_inicio)}
            className={
              "rounded-lg border px-2 py-1 text-sm " +
              (horaInicioISO === s.hora_inicio
                ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-400")
            }
          >
            {formatoHora(s.hora_inicio)}
          </button>
        ))}
        {horasUnicas.length === 0 && <p className="text-sm text-stone-400">No hay huecos ese día.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Nombre del cliente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="rounded-lg border border-stone-300 p-2 text-sm"
        />
        <input
          placeholder="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className="rounded-lg border border-stone-300 p-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        disabled={!horaInicioISO || !nombre || !telefono || enviando}
        onClick={crear}
        className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
      >
        {enviando ? "Guardando…" : "Guardar cita"}
      </button>
    </div>
  );
}

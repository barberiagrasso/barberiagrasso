"use client";

import { useEffect, useState } from "react";

interface Sede {
  id: string;
  nombre: string;
}
interface Servicio {
  id: string;
  nombre: string;
  categoria: string | null;
}
interface Profesional {
  id: string;
  nombre: string;
  activo: boolean;
  sede_ids: string[];
  servicio_ids: string[];
}
interface Horario {
  id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function ProfesionalesClient({ sedes, servicios }: { sedes: Sede[]; servicios: Servicio[] }) {
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const res = await fetch("/api/admin/profesionales");
    const json = await res.json();
    setProfesionales(json.profesionales ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear() {
    if (!nombreNuevo.trim()) return;
    const res = await fetch("/api/admin/profesionales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombreNuevo.trim() }),
    });
    if (res.ok) {
      setNombreNuevo("");
      setCreando(false);
      cargar();
    }
  }

  async function alternarActivo(p: Profesional) {
    await fetch(`/api/admin/profesionales/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !p.activo }),
    });
    cargar();
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setCreando((v) => !v)} className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white">
        {creando ? "Cerrar" : "+ Nuevo profesional"}
      </button>
      {creando && (
        <div className="flex gap-2">
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre del barbero"
            className="rounded-lg border border-stone-300 p-2 text-sm"
          />
          <button onClick={crear} className="rounded-lg bg-brand-yellow px-3 py-2 text-sm font-medium text-brand-yellow-ink">
            Crear
          </button>
        </div>
      )}

      {cargando && <p className="text-sm text-stone-500">Cargando…</p>}

      <div className="space-y-3">
        {profesionales.map((p) => (
          <div key={p.id} className="rounded-lg border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className={"font-medium " + (p.activo ? "text-stone-900" : "text-stone-400 line-through")}>
                {p.nombre}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => setExpandidoId(expandidoId === p.id ? null : p.id)} className="text-brand-yellow-dark underline">
                  {expandidoId === p.id ? "Cerrar" : "Sedes, servicios y horario"}
                </button>
                <button onClick={() => alternarActivo(p)} className={p.activo ? "text-red-700 underline" : "text-green-700 underline"}>
                  {p.activo ? "Desactivar" : "Reactivar"}
                </button>
              </div>
            </div>
            {expandidoId === p.id && (
              <DetalleProfesional
                profesional={p}
                sedes={sedes}
                servicios={servicios}
                onCambiado={cargar}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetalleProfesional({
  profesional,
  sedes,
  servicios,
  onCambiado,
}: {
  profesional: Profesional;
  sedes: Sede[];
  servicios: Servicio[];
  onCambiado: () => void;
}) {
  const [sedeIds, setSedeIds] = useState<string[]>(profesional.sede_ids);
  const [servicioIds, setServicioIds] = useState<string[]>(profesional.servicio_ids);
  const [guardando, setGuardando] = useState(false);
  const [sedeHorarioId, setSedeHorarioId] = useState<string>(sedeIds[0] ?? "");

  function alternar(lista: string[], set: (v: string[]) => void, id: string) {
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  async function guardarAsignaciones() {
    setGuardando(true);
    await fetch(`/api/admin/profesionales/${profesional.id}/asignaciones`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sedeIds, servicioIds }),
    });
    setGuardando(false);
    onCambiado();
  }

  return (
    <div className="space-y-4 border-t border-stone-100 p-4">
      <div>
        <h3 className="mb-1 text-sm font-medium text-stone-700">Sedes donde trabaja</h3>
        <div className="flex flex-wrap gap-3">
          {sedes.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm text-stone-700">
              <input type="checkbox" checked={sedeIds.includes(s.id)} onChange={() => alternar(sedeIds, setSedeIds, s.id)} />
              {s.nombre}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-stone-700">Servicios que realiza</h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {servicios.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm text-stone-700">
              <input type="checkbox" checked={servicioIds.includes(s.id)} onChange={() => alternar(servicioIds, setServicioIds, s.id)} />
              {s.nombre}
            </label>
          ))}
        </div>
      </div>

      <button
        disabled={guardando}
        onClick={guardarAsignaciones}
        className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar sedes y servicios"}
      </button>

      {sedeIds.length > 0 && (
        <div className="border-t border-stone-100 pt-4">
          <h3 className="mb-2 text-sm font-medium text-stone-700">Horario semanal</h3>
          <div className="mb-2 flex gap-2">
            {sedeIds.map((id) => {
              const sede = sedes.find((s) => s.id === id);
              return (
                <button
                  key={id}
                  onClick={() => setSedeHorarioId(id)}
                  className={
                    "rounded-lg border px-2 py-1 text-xs " +
                    (sedeHorarioId === id
                      ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-400")
                  }
                >
                  {sede?.nombre}
                </button>
              );
            })}
          </div>
          {sedeHorarioId && (
            <EditorHorario key={sedeHorarioId} profesionalId={profesional.id} sedeId={sedeHorarioId} />
          )}
        </div>
      )}
    </div>
  );
}

function EditorHorario({ profesionalId, sedeId }: { profesionalId: string; sedeId: string }) {
  const [dias, setDias] = useState<Record<number, { activo: boolean; inicio: string; fin: string }>>(() => {
    const base: Record<number, { activo: boolean; inicio: string; fin: string }> = {};
    for (let d = 0; d < 7; d++) base[d] = { activo: false, inicio: "09:30", fin: "20:30" };
    return base;
  });
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/profesionales/${profesionalId}/horarios?sedeId=${sedeId}`)
      .then((r) => r.json())
      .then((j) => {
        const nuevo: Record<number, { activo: boolean; inicio: string; fin: string }> = {};
        for (let d = 0; d < 7; d++) nuevo[d] = { activo: false, inicio: "09:30", fin: "20:30" };
        for (const h of (j.horarios ?? []) as Horario[]) {
          nuevo[h.dia_semana] = { activo: true, inicio: h.hora_inicio.slice(0, 5), fin: h.hora_fin.slice(0, 5) };
        }
        setDias(nuevo);
        setCargado(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionalId, sedeId]);

  if (!cargado) {
    return <p className="text-sm text-stone-400">Cargando horario…</p>;
  }

  async function guardar() {
    setGuardando(true);
    const turnos = Object.entries(dias)
      .filter(([, v]) => v.activo)
      .map(([dia, v]) => ({ dia_semana: parseInt(dia, 10), hora_inicio: `${v.inicio}:00`, hora_fin: `${v.fin}:00` }));
    await fetch(`/api/admin/profesionales/${profesionalId}/horarios`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sedeId, horarios: turnos }),
    });
    setGuardando(false);
  }

  return (
    <div className="space-y-2">
      {DIAS.map((nombreDia, d) => (
        <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex w-28 items-center gap-1.5 text-stone-700">
            <input
              type="checkbox"
              checked={dias[d].activo}
              onChange={(e) => setDias({ ...dias, [d]: { ...dias[d], activo: e.target.checked } })}
            />
            {nombreDia}
          </label>
          {dias[d].activo && (
            <>
              <input
                type="time"
                value={dias[d].inicio}
                onChange={(e) => setDias({ ...dias, [d]: { ...dias[d], inicio: e.target.value } })}
                className="rounded border border-stone-300 p-1 text-sm"
              />
              <span className="text-stone-400">a</span>
              <input
                type="time"
                value={dias[d].fin}
                onChange={(e) => setDias({ ...dias, [d]: { ...dias[d], fin: e.target.value } })}
                className="rounded border border-stone-300 p-1 text-sm"
              />
            </>
          )}
        </div>
      ))}
      <button
        disabled={guardando}
        onClick={guardar}
        className="rounded-lg bg-brand-yellow px-3 py-1.5 text-sm font-medium text-brand-yellow-ink disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar horario"}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import FinalizarCitaModal from "./FinalizarCitaModal";
import CalendarioDia from "./CalendarioDia";

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
  categoria: string | null;
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
  extras?: { servicio_id: string }[];
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

// --- Helpers para la vista semanal: trabajamos siempre con la fecha en
// formato "YYYY-MM-DD" a mediodía UTC, para no arrastrar líos de huso
// horario al sumar/restar días o calcular el lunes de la semana.
function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function lunesDeLaSemana(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const diaSemana = fecha.getUTCDay(); // 0 = domingo, 1 = lunes...
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  fecha.setUTCDate(fecha.getUTCDate() + offset);
  return fecha.toISOString().slice(0, 10);
}

function nombreDiaCorto(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "short",
    timeZone: "Europe/Madrid",
  });
}

function formatoFechaCorta(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00`).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
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
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionalesDia, setProfesionalesDia] = useState<{ id: string; nombre: string }[]>([]);
  const [horariosDia, setHorariosDia] = useState<{ profesional_id: string; hora_inicio: string; hora_fin: string }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [finalizando, setFinalizando] = useState<Cita | null>(null);

  // En modo semana, "fecha" sigue siendo el día ancla (el que se ve en el
  // selector antes de cambiar de vista); los 7 días mostrados son los de
  // la semana (lunes a domingo) a la que pertenece.
  const diasSemana = useMemo(() => {
    if (vista !== "semana") return [];
    const lunes = lunesDeLaSemana(fecha);
    return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  }, [vista, fecha]);

  async function cargarCitas() {
    if (!sedeId) return;
    setCargando(true);
    const fechaInicio = vista === "semana" ? diasSemana[0] ?? fecha : fecha;
    const fechaFinRango = vista === "semana" ? diasSemana[6] ?? fecha : fecha;
    const res = await fetch(`/api/admin/citas?sedeId=${sedeId}&fecha=${fechaInicio}&fechaFin=${fechaFinRango}`);
    const json = await res.json();
    setCitas(json.citas ?? []);
    setProfesionalesDia(json.profesionales ?? []);
    setHorariosDia(json.horarios ?? []);
    setCargando(false);
  }

  useEffect(() => {
    void cargarCitas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId, fecha, vista]);

  function moverFecha(dias: number) {
    setFecha((f) => sumarDias(f, dias));
  }

  async function cambiarEstado(id: string, estado: string) {
    await fetch(`/api/admin/citas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    cargarCitas();
  }

  const [avisando, setAvisando] = useState<string | null>(null);

  // Avisa por WhatsApp al siguiente cliente de este mismo profesional de
  // que ya está disponible por si quiere venir antes — pensado para
  // cuando una cita termina antes de lo previsto. Pide confirmación
  // porque manda un mensaje de verdad, que no se puede deshacer.
  async function avisarDisponible(id: string) {
    if (!confirm("¿Avisar por WhatsApp a tu siguiente cliente de que ya estás disponible?")) return;
    setAvisando(id);
    const res = await fetch(`/api/admin/citas/${id}/avisar-disponible`, { method: "POST" });
    const json = await res.json();
    setAvisando(null);
    if (!res.ok) {
      alert(json.error || "No se pudo enviar el aviso.");
      return;
    }
    alert(`Aviso enviado a ${json.clienteNombre}.`);
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
        <div className="flex gap-1 rounded-lg border border-stone-300 p-1">
          <button
            onClick={() => setVista("dia")}
            className={
              "rounded-md px-2 py-1 text-sm " +
              (vista === "dia" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")
            }
          >
            Día
          </button>
          <button
            onClick={() => setVista("semana")}
            className={
              "rounded-md px-2 py-1 text-sm " +
              (vista === "semana" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")
            }
          >
            Semana
          </button>
        </div>

        {vista === "dia" ? (
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border border-stone-300 p-2 text-sm"
          />
        ) : (
          <div className="flex items-center gap-2 text-sm text-stone-700">
            <button
              onClick={() => moverFecha(-7)}
              className="rounded-lg border border-stone-300 px-2 py-1 hover:border-stone-400"
              aria-label="Semana anterior"
            >
              ‹
            </button>
            <span className="whitespace-nowrap">
              {diasSemana.length > 0 && `${formatoFechaCorta(diasSemana[0])} – ${formatoFechaCorta(diasSemana[6])}`}
            </span>
            <button
              onClick={() => moverFecha(7)}
              className="rounded-lg border border-stone-300 px-2 py-1 hover:border-stone-400"
              aria-label="Semana siguiente"
            >
              ›
            </button>
          </div>
        )}

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

      {vista === "dia" ? (
        <CalendarioDia
          fecha={fecha}
          citas={citas}
          profesionales={profesionalesDia}
          horarios={horariosDia}
          cargando={cargando}
          onFinalizar={setFinalizando}
          onCambiarEstado={cambiarEstado}
          onAvisarDisponible={avisarDisponible}
          avisando={avisando}
        />
      ) : (
        <VistaSemanal
          dias={diasSemana}
          citas={citas}
          cargando={cargando}
          onFinalizar={setFinalizando}
          onCambiarEstado={cambiarEstado}
          onAvisarDisponible={avisarDisponible}
          avisando={avisando}
        />
      )}

      {finalizando && (
        <FinalizarCitaModal
          cita={finalizando}
          sedeId={sedeId}
          servicios={servicios}
          onCerrar={() => setFinalizando(null)}
          onGuardada={() => {
            setFinalizando(null);
            cargarCitas();
          }}
        />
      )}
    </div>
  );
}

function VistaSemanal({
  dias,
  citas,
  cargando,
  onFinalizar,
  onCambiarEstado,
  onAvisarDisponible,
  avisando,
}: {
  dias: string[];
  citas: Cita[];
  cargando: boolean;
  onFinalizar: (cita: Cita) => void;
  onCambiarEstado: (id: string, estado: string) => void;
  onAvisarDisponible: (id: string) => void;
  avisando: string | null;
}) {
  const citasPorDia = useMemo(() => {
    const mapa = new Map<string, Cita[]>();
    for (const d of dias) mapa.set(d, []);
    for (const cita of citas) {
      const diaISO = cita.inicio.slice(0, 10);
      mapa.get(diaISO)?.push(cita);
    }
    return mapa;
  }, [dias, citas]);

  const hoy = hoyISO();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {dias.map((dia) => (
        <div
          key={dia}
          className={
            "rounded-lg border bg-white p-2 " + (dia === hoy ? "border-brand-yellow" : "border-stone-200")
          }
        >
          <div className="mb-2 text-center">
            <div className="text-xs uppercase text-stone-500">{nombreDiaCorto(dia)}</div>
            <div className="text-sm font-medium text-stone-900">{formatoFechaCorta(dia)}</div>
          </div>
          <div className="space-y-2">
            {cargando && <p className="text-xs text-stone-400">Cargando…</p>}
            {!cargando && (citasPorDia.get(dia) ?? []).length === 0 && (
              <p className="text-xs text-stone-400">Sin citas</p>
            )}
            {(citasPorDia.get(dia) ?? []).map((cita) => (
              <div key={cita.id} className="rounded-lg border border-stone-200 p-2 text-xs">
                <div className="font-medium text-stone-900">
                  {formatoHora(cita.inicio)} · {cita.cliente?.nombre ?? "Cliente"}
                </div>
                <div className="text-stone-500">
                  {cita.servicio?.nombre} · {cita.profesional?.nombre ?? "Cualquiera"}
                </div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span
                    className={
                      "rounded-full px-1.5 py-0.5 " +
                      (cita.estado === "cancelada"
                        ? "bg-red-100 text-red-700"
                        : cita.estado === "completada"
                        ? "bg-green-100 text-green-700"
                        : "bg-stone-100 text-stone-700")
                    }
                  >
                    {ETIQUETA_ESTADO[cita.estado] ?? cita.estado}
                  </span>
                  <div className="flex gap-1.5">
                    {(cita.estado === "confirmada" || cita.estado === "completada") && (
                      <button
                        onClick={() => onAvisarDisponible(cita.id)}
                        disabled={avisando === cita.id}
                        className="text-blue-700 underline disabled:opacity-50"
                        title="Avisar por WhatsApp a tu siguiente cliente de que ya estás disponible"
                      >
                        📲
                      </button>
                    )}
                    {cita.estado === "confirmada" && (
                      <>
                        <button
                          onClick={() => onFinalizar(cita)}
                          className="text-green-700 underline"
                          title="Marcar como completada"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => onCambiarEstado(cita.id, "no_presentada")}
                          className="text-amber-700 underline"
                          title="Marcar como no presentada"
                        >
                          !
                        </button>
                        <button
                          onClick={() => onCambiarEstado(cita.id, "cancelada")}
                          className="text-red-700 underline"
                          title="Cancelar"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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

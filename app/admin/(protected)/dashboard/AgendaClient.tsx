"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FinalizarCitaModal from "./FinalizarCitaModal";
import CalendarioDia from "./CalendarioDia";
import ListaEsperaClient from "../lista-espera/ListaEsperaClient";
import { IconBell, IconCheck, IconAlertCircle, IconX } from "@/components/ui/Icons";

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
  color?: string | null;
}
interface Cita {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  origen: string;
  profesional_elegido_por_cliente?: boolean;
  metodo_pago?: string | null;
  cliente: { id: string; nombre: string; telefono: string | null } | null;
  servicio: { id: string; nombre: string; color?: string | null } | null;
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

interface DatosAgendaIniciales {
  citas: Cita[];
  profesionales: { id: string; nombre: string }[];
  horarios: { profesional_id: string; hora_inicio: string; hora_fin: string; descanso_inicio?: string | null; descanso_fin?: string | null }[];
  descansosExcepciones: { profesional_id: string; hora_inicio: string; hora_fin: string }[];
}

export default function AgendaClient({
  sedes,
  servicios,
  esAdmin,
  datosIniciales,
}: {
  sedes: Sede[];
  servicios: Servicio[];
  esAdmin: boolean;
  // Citas de hoy en la primera sede, ya cargadas en el servidor (ver
  // dashboard/page.tsx) — mismos parámetros con los que arrancaría el
  // primer fetch de abajo. null si no hay ninguna sede configurada.
  datosIniciales: DatosAgendaIniciales | null;
}) {
  const [pestana, setPestana] = useState<"citas" | "lista-espera">("citas");
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoyISO());
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [citas, setCitas] = useState<Cita[]>(datosIniciales?.citas ?? []);
  const [profesionalesDia, setProfesionalesDia] = useState<{ id: string; nombre: string }[]>(
    datosIniciales?.profesionales ?? []
  );
  const [horariosDia, setHorariosDia] = useState<
    { profesional_id: string; hora_inicio: string; hora_fin: string; descanso_inicio?: string | null; descanso_fin?: string | null }[]
  >(datosIniciales?.horarios ?? []);
  const [descansosExcepciones, setDescansosExcepciones] = useState<
    { profesional_id: string; hora_inicio: string; hora_fin: string }[]
  >(datosIniciales?.descansosExcepciones ?? []);
  const [cargando, setCargando] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [finalizando, setFinalizando] = useState<Cita | null>(null);
  // El primer render ya trae los datos correctos desde el servidor
  // (datosIniciales, con estos mismos sedeId/fecha) — se salta solo ESE
  // primer fetch para no pedirlos dos veces; cualquier cambio real de
  // sede, fecha o vista después sí dispara la carga como siempre.
  const esPrimerFetch = useRef(true);

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
    setDescansosExcepciones(json.descansosExcepciones ?? []);
    setCargando(false);
  }

  useEffect(() => {
    // Si esto es lo primero que se ejecuta Y ya llegaron datos del
    // servidor para esta misma sede/fecha (vista "día", que es como
    // arranca siempre AgendaClient), no hace falta volver a pedirlos.
    if (esPrimerFetch.current) {
      esPrimerFetch.current = false;
      if (datosIniciales && sedeId === (sedes[0]?.id ?? "") && fecha === hoyISO() && vista === "dia") return;
    }
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

  // Arrastrar una cita en el calendario de día para cambiarla de hora
  // (solo admin — ver esAdmin en CalendarioDia.tsx). El backend
  // (PATCH /api/admin/citas/[id]) comprueba que el profesional no tenga
  // ya otra cita a esa hora antes de moverla.
  async function moverCita(id: string, nuevoInicioISO: string) {
    const res = await fetch(`/api/admin/citas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horaInicioISO: nuevoInicioISO }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || "No se pudo mover la cita.");
    }
    cargarCitas();
  }

  // Leyenda de colores por servicio: uno por cada servicio con color que
  // tenga al menos una cita cargada ahora mismo, en vez de todo el
  // catálogo — así no sale un servicio irrelevante que nunca se usa en
  // esta sede.
  const leyendaServicios = useMemo(() => {
    const vistos = new Map<string, { nombre: string; color: string }>();
    for (const c of citas) {
      const s = c.servicio;
      if (s?.color && !vistos.has(s.id)) vistos.set(s.id, { nombre: s.nombre, color: s.color });
    }
    if (vistos.size === 0) {
      // Nada cargado todavía (agenda vacía): se enseña el catálogo
      // completo para que la leyenda no aparezca en blanco.
      for (const s of servicios) {
        if (s.color) vistos.set(s.id, { nombre: s.nombre, color: s.color });
      }
    }
    return Array.from(vistos.values());
  }, [citas, servicios]);

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
      <div className="flex gap-1 rounded-lg border border-stone-300 p-1 w-fit">
        <button
          onClick={() => setPestana("citas")}
          className={
            "rounded-md px-3 py-1.5 text-sm " +
            (pestana === "citas" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")
          }
        >
          Citas
        </button>
        <button
          onClick={() => setPestana("lista-espera")}
          className={
            "rounded-md px-3 py-1.5 text-sm " +
            (pestana === "lista-espera" ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")
          }
        >
          Lista de espera
        </button>
      </div>

      {pestana === "lista-espera" && <ListaEsperaClient sedes={sedes} />}

      {pestana === "citas" && (
        <>
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => moverFecha(-1)}
              className="rounded-lg border border-stone-300 px-2 py-2 text-sm text-stone-600 hover:border-stone-400"
              aria-label="Día anterior"
            >
              ‹
            </button>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-lg border border-stone-300 p-2 text-sm"
            />
            <button
              onClick={() => moverFecha(1)}
              className="rounded-lg border border-stone-300 px-2 py-2 text-sm text-stone-600 hover:border-stone-400"
              aria-label="Día siguiente"
            >
              ›
            </button>
          </div>
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
          sedeId={sedeId}
          fecha={fecha}
          citas={citas}
          profesionales={profesionalesDia}
          horarios={horariosDia}
          descansosExcepciones={descansosExcepciones}
          esAdmin={esAdmin}
          cargando={cargando}
          onFinalizar={setFinalizando}
          onCambiarEstado={cambiarEstado}
          onAvisarDisponible={avisarDisponible}
          onDescansoMovido={cargarCitas}
          onMoverCita={moverCita}
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

      {leyendaServicios.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
          {leyendaServicios.map((s) => (
            <span key={s.nombre} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.nombre}
            </span>
          ))}
        </div>
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
        </>
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
              <div
                key={cita.id}
                className="rounded-lg border border-l-4 border-stone-200 p-2 text-xs"
                style={cita.servicio?.color && cita.estado !== "cancelada" ? { borderLeftColor: cita.servicio.color } : undefined}
              >
                <div className="flex items-center gap-1 font-medium text-stone-900">
                  {cita.profesional_elegido_por_cliente && (
                    <span className="text-red-500" title="El cliente pidió a este profesional en concreto">♥</span>
                  )}
                  {cita.estado === "completada" && <span className="text-emerald-600" title="Completada">✓</span>}
                  {cita.estado === "completada" && cita.metodo_pago && (
                    <span className="text-emerald-600" title="Pagada">$</span>
                  )}
                  {formatoHora(cita.inicio)} · {cita.cliente?.nombre ?? "Cliente"}
                </div>
                <div className="text-stone-500">
                  {cita.servicio?.nombre} · {cita.profesional?.nombre ?? "Cualquiera"}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
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
                  <div className="flex flex-wrap justify-end gap-1">
                    {(cita.estado === "confirmada" || cita.estado === "completada") && (
                      <button
                        onClick={() => onAvisarDisponible(cita.id)}
                        disabled={avisando === cita.id}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white disabled:opacity-50"
                        title="Avisar por WhatsApp a tu siguiente cliente de que ya estás disponible"
                      >
                        <IconBell className="h-3 w-3" />
                      </button>
                    )}
                    {cita.estado === "confirmada" && (
                      <>
                        <button
                          onClick={() => onFinalizar(cita)}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"
                          title="Marcar como completada"
                        >
                          <IconCheck className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onCambiarEstado(cita.id, "no_presentada")}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white"
                          title="Marcar como no presentada"
                        >
                          <IconAlertCircle className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onCambiarEstado(cita.id, "cancelada")}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                          title="Cancelar"
                        >
                          <IconX className="h-3 w-3" />
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
    // Se pasa "fecha" para que, si ese día concreto hay un profesional
    // puntualmente destinado a esta sede (p.ej. Juan en Los Molinos),
    // aparezca en el desplegable aunque no sea de aquí de forma habitual.
    fetch(`/api/profesionales?sedeId=${sedeId}&servicioId=${servicioId}&fecha=${fecha}`)
      .then((r) => r.json())
      .then((j) => setProfesionales(j.profesionales ?? []));
  }, [servicioId, sedeId, fecha]);

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

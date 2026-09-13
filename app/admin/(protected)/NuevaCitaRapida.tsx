"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResumenDiaDisponibilidad } from "@/lib/types";

// =====================================================================
// Botón flotante "+" (siempre visible en el espacio del equipo) para
// crear una cita en segundos sin tener que ir primero a la Agenda: el
// barbero elige sede, servicio y profesional (puede ser de cualquiera
// de las dos sedes), pica un hueco en el calendario y escribe el
// teléfono del cliente — si ya existe, se le enseña el nombre para que
// pueda confirmarlo en persona antes de guardar.
// =====================================================================

interface Sede {
  id: string;
  nombre: string;
}
interface Servicio {
  id: string;
  nombre: string;
  duracion_minutos: number;
  precio_centimos: number;
}
interface Profesional {
  id: string;
  nombre: string;
}

const MESES_ADELANTE_MAX = 3;
const NOMBRES_DIA_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function fechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}
function hoyLocalISO(): string {
  const hoy = new Date();
  return fechaISO(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
}
function indiceMes(anio: number, mes: number): number {
  return anio * 12 + (mes - 1);
}
function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primerDia = new Date(anio, mes - 1, 1);
  const totalDias = new Date(anio, mes, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7; // lunes=0 ... domingo=6
  const celdas: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= totalDias; d++) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}
function nombreMes(anio: number, mes: number): string {
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-ES", { month: "long" });
}
function formatoHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}
function colorPuntoNivel(nivel: ResumenDiaDisponibilidad["nivel"] | undefined): string {
  switch (nivel) {
    case "alta":
      return "bg-emerald-500";
    case "media":
      return "bg-amber-400";
    case "baja":
      return "bg-red-500";
    default:
      return "bg-transparent";
  }
}

type EstadoCliente = { tipo: "vacio" } | { tipo: "buscando" } | { tipo: "encontrado"; nombre: string } | { tipo: "nuevo" };

export default function NuevaCitaRapida({ sedes, servicios }: { sedes: Sede[]; servicios: Servicio[] }) {
  const [abierto, setAbierto] = useState(false);

  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [profesionalId, setProfesionalId] = useState(""); // "" = cualquiera

  const [mesVisible, setMesVisible] = useState(() => {
    const hoy = new Date();
    return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  });
  const [resumenMes, setResumenMes] = useState<Record<string, ResumenDiaDisponibilidad>>({});
  const [fecha, setFecha] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ hora_inicio: string; profesional_id: string; profesional_nombre: string }[]>([]);
  const [horaInicioISO, setHoraInicioISO] = useState("");

  const [telefono, setTelefono] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [estadoCliente, setEstadoCliente] = useState<EstadoCliente>({ tipo: "vacio" });

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  function reiniciar() {
    setSedeId(sedes[0]?.id ?? "");
    setServicioId(servicios[0]?.id ?? "");
    setProfesionalId("");
    const hoy = new Date();
    setMesVisible({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 });
    setFecha(null);
    setSlots([]);
    setHoraInicioISO("");
    setTelefono("");
    setNombreNuevo("");
    setEstadoCliente({ tipo: "vacio" });
    setError(null);
    setExito(false);
  }

  function cerrar() {
    setAbierto(false);
    // Pequeño respiro visual antes de limpiar, para que no se vea el
    // formulario "en blanco" mientras se cierra la animación.
    setTimeout(reiniciar, 200);
  }

  // Profesionales disponibles para la sede+servicio elegidos. Solo se
  // consulta con el panel abierto, para no lanzar peticiones de fondo en
  // cada página del panel solo por tener este botón montado.
  useEffect(() => {
    if (!abierto || !sedeId || !servicioId) return;
    setProfesionalId("");
    fetch(`/api/profesionales?sedeId=${sedeId}&servicioId=${servicioId}`)
      .then((r) => r.json())
      .then((j) => setProfesionales(j.profesionales ?? []));
  }, [abierto, sedeId, servicioId]);

  // Resumen del mes visible (para pintar los puntos de disponibilidad).
  useEffect(() => {
    if (!abierto || !sedeId || !servicioId) return;
    const p = new URLSearchParams({
      sedeId,
      servicioId,
      anio: String(mesVisible.anio),
      mes: String(mesVisible.mes),
    });
    if (profesionalId) p.set("profesionalId", profesionalId);
    fetch(`/api/disponibilidad/mes?${p.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        const mapa: Record<string, ResumenDiaDisponibilidad> = {};
        for (const d of j.dias ?? []) mapa[d.fecha] = d;
        setResumenMes(mapa);
      });
  }, [abierto, sedeId, servicioId, profesionalId, mesVisible]);

  // Huecos del día elegido.
  useEffect(() => {
    if (!fecha || !sedeId || !servicioId) {
      setSlots([]);
      return;
    }
    const p = new URLSearchParams({ sedeId, servicioId, fecha });
    if (profesionalId) p.set("profesionalId", profesionalId);
    fetch(`/api/disponibilidad?${p.toString()}`)
      .then((r) => r.json())
      .then((j) => setSlots(j.slots ?? []));
  }, [fecha, sedeId, servicioId, profesionalId]);

  // Búsqueda del cliente por teléfono (con un pequeño debounce para no
  // lanzar una petición por cada tecla).
  useEffect(() => {
    const telefonoLimpio = telefono.trim();
    if (telefonoLimpio.length < 6) {
      setEstadoCliente({ tipo: "vacio" });
      return;
    }
    setEstadoCliente({ tipo: "buscando" });
    const idTimeout = setTimeout(() => {
      fetch(`/api/admin/citas/buscar-cliente?telefono=${encodeURIComponent(telefonoLimpio)}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.nombre) setEstadoCliente({ tipo: "encontrado", nombre: j.nombre });
          else setEstadoCliente({ tipo: "nuevo" });
        })
        .catch(() => setEstadoCliente({ tipo: "vacio" }));
    }, 400);
    return () => clearTimeout(idTimeout);
  }, [telefono]);

  const horasUnicas = useMemo(
    () => Array.from(new Map(slots.map((s) => [s.hora_inicio, s])).values()),
    [slots]
  );

  const indiceMesVisible = indiceMes(mesVisible.anio, mesVisible.mes);
  const indiceMesActual = indiceMes(new Date().getFullYear(), new Date().getMonth() + 1);

  const nombreParaGuardar = estadoCliente.tipo === "encontrado" ? estadoCliente.nombre : nombreNuevo.trim();
  const puedeConfirmar =
    Boolean(sedeId && servicioId && horaInicioISO && telefono.trim().length >= 6 && nombreParaGuardar) && !enviando;

  async function confirmar() {
    if (!puedeConfirmar || !fecha) return;
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
        cliente: { nombre: nombreParaGuardar, telefono },
        aceptaComercial: false,
      }),
    });
    const json = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setError(json.error || "No se pudo crear la cita.");
      return;
    }
    setExito(true);
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label="Nueva cita rápida"
        title="Nueva cita rápida"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow text-brand-yellow-ink shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
      >
        <span className="text-3xl leading-none">+</span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">Nueva cita rápida</h2>
              <button onClick={cerrar} className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Cerrar">
                ✕
              </button>
            </div>

            {exito ? (
              <div className="space-y-4 py-4 text-center">
                <p className="text-2xl">✓</p>
                <p className="font-medium text-stone-800">Cita creada correctamente.</p>
                <div className="flex justify-center gap-2">
                  <button onClick={reiniciar} className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-400">
                    Crear otra
                  </button>
                  <button onClick={cerrar} className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark">
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Sede</p>
                  <div className="flex flex-wrap gap-2">
                    {sedes.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSedeId(s.id);
                          setFecha(null);
                          setHoraInicioISO("");
                        }}
                        className={
                          "rounded-lg border px-3 py-1.5 text-sm " +
                          (sedeId === s.id
                            ? "border-brand-yellow bg-brand-yellow text-brand-yellow-ink"
                            : "border-stone-300 bg-white text-stone-700 hover:border-stone-400")
                        }
                      >
                        {s.nombre}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Servicio</p>
                    <select
                      value={servicioId}
                      onChange={(e) => {
                        setServicioId(e.target.value);
                        setFecha(null);
                        setHoraInicioISO("");
                      }}
                      className="w-full rounded-lg border border-stone-300 p-2 text-sm"
                    >
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Profesional</p>
                    <select
                      value={profesionalId}
                      onChange={(e) => {
                        setProfesionalId(e.target.value);
                        setHoraInicioISO("");
                      }}
                      className="w-full rounded-lg border border-stone-300 p-2 text-sm"
                    >
                      <option value="">Cualquiera</option>
                      {profesionales.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Fecha</p>
                  <div className="rounded-lg border border-stone-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        disabled={indiceMesVisible <= indiceMesActual}
                        onClick={() =>
                          setMesVisible((m) => (m.mes === 1 ? { anio: m.anio - 1, mes: 12 } : { anio: m.anio, mes: m.mes - 1 }))
                        }
                        className="rounded px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <span className="text-sm font-medium capitalize text-stone-800">
                        {nombreMes(mesVisible.anio, mesVisible.mes)} {mesVisible.anio}
                      </span>
                      <button
                        disabled={indiceMesVisible >= indiceMesActual + MESES_ADELANTE_MAX}
                        onClick={() =>
                          setMesVisible((m) => (m.mes === 12 ? { anio: m.anio + 1, mes: 1 } : { anio: m.anio, mes: m.mes + 1 }))
                        }
                        className="rounded px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                      >
                        ›
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-400">
                      {NOMBRES_DIA_SEMANA.map((d) => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {celdasDelMes(mesVisible.anio, mesVisible.mes).map((dia, i) => {
                        if (dia === null) return <div key={i} />;
                        const fechaCelda = fechaISO(mesVisible.anio, mesVisible.mes, dia);
                        const resumen = resumenMes[fechaCelda];
                        const esPasado = fechaCelda < hoyLocalISO();
                        const seleccionable = !esPasado && resumen?.seleccionable;
                        return (
                          <button
                            key={i}
                            disabled={!seleccionable}
                            onClick={() => {
                              setFecha(fechaCelda);
                              setHoraInicioISO("");
                            }}
                            className={
                              "flex flex-col items-center rounded-lg py-1.5 text-sm " +
                              (fecha === fechaCelda
                                ? "bg-brand-yellow text-brand-yellow-ink"
                                : seleccionable
                                ? "text-stone-800 hover:bg-stone-100"
                                : "text-stone-300")
                            }
                          >
                            {dia}
                            <span className={"mt-0.5 h-1 w-1 rounded-full " + (seleccionable ? colorPuntoNivel(resumen?.nivel) : "bg-transparent")} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {fecha && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Hora</p>
                    <div className="flex flex-wrap gap-2">
                      {horasUnicas.map((s) => (
                        <button
                          key={s.hora_inicio}
                          onClick={() => setHoraInicioISO(s.hora_inicio)}
                          className={
                            "rounded-lg border px-2.5 py-1 text-sm " +
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
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Teléfono del cliente</p>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="612 345 678"
                    className="w-full rounded-lg border border-stone-300 p-2 text-sm"
                  />
                  {estadoCliente.tipo === "buscando" && <p className="mt-1 text-xs text-stone-400">Buscando…</p>}
                  {estadoCliente.tipo === "encontrado" && (
                    <p className="mt-1 text-sm text-emerald-700">
                      Cliente encontrado: <strong>{estadoCliente.nombre}</strong> — confírmalo con él/ella antes de guardar.
                    </p>
                  )}
                  {estadoCliente.tipo === "nuevo" && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs text-amber-700">No hay ningún cliente con este teléfono — se creará uno nuevo.</p>
                      <input
                        value={nombreNuevo}
                        onChange={(e) => setNombreNuevo(e.target.value)}
                        placeholder="Nombre del cliente nuevo"
                        className="w-full rounded-lg border border-stone-300 p-2 text-sm"
                      />
                    </div>
                  )}
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  disabled={!puedeConfirmar}
                  onClick={confirmar}
                  className="w-full rounded-lg bg-brand-yellow px-4 py-2.5 text-sm font-medium text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
                >
                  {enviando ? "Guardando…" : "Guardar cita"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

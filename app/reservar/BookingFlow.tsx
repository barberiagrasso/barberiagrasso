"use client";

import { useMemo, useState } from "react";
import type { Sede, Servicio, FranjaDisponible } from "@/lib/types";

type Paso = "sede" | "servicio" | "profesional" | "fecha" | "datos" | "confirmado";

interface ProfesionalOpcion {
  id: string;
  nombre: string;
}

interface Props {
  sedes: Sede[];
  servicios: Servicio[];
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function proximosDias(cantidad: number) {
  const dias: { valor: string; etiqueta: string }[] = [];
  const hoy = new Date();
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const valor = d.toISOString().slice(0, 10);
    const etiqueta = d.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    dias.push({ valor, etiqueta });
  }
  return dias;
}

export default function BookingFlow({ sedes, servicios }: Props) {
  const [paso, setPaso] = useState<Paso>("sede");
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [profesionalId, setProfesionalId] = useState<string | null>(null); // null = cualquiera
  const [profesionales, setProfesionales] = useState<ProfesionalOpcion[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [slots, setSlots] = useState<FranjaDisponible[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [slotElegido, setSlotElegido] = useState<FranjaDisponible | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [aceptaComercial, setAceptaComercial] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citaConfirmada, setCitaConfirmada] = useState<{ inicio: string; profesionalNombre: string } | null>(null);

  const dias = useMemo(() => proximosDias(14), []);
  const sedeSeleccionada = sedes.find((s) => s.id === sedeId);
  const servicioSeleccionado = servicios.find((s) => s.id === servicioId);

  async function elegirServicioYContinuar(id: string) {
    setServicioId(id);
    setPaso("profesional");
    if (sedeId) {
      const res = await fetch(`/api/profesionales?sedeId=${sedeId}&servicioId=${id}`);
      const json = await res.json();
      setProfesionales(json.profesionales ?? []);
    }
  }

  async function elegirFecha(valor: string) {
    setFecha(valor);
    setSlotElegido(null);
    setCargandoSlots(true);
    setSlots([]);
    const params = new URLSearchParams({
      sedeId: sedeId!,
      servicioId: servicioId!,
      fecha: valor,
    });
    if (profesionalId) params.set("profesionalId", profesionalId);
    const res = await fetch(`/api/disponibilidad?${params.toString()}`);
    const json = await res.json();
    setCargandoSlots(false);
    setSlots(json.slots ?? []);
  }

  // Solo una franja horaria por hora visible (si "cualquiera" hay varios
  // profesionales libres a la misma hora, se muestra una sola opción).
  const horasUnicas = useMemo(() => {
    const mapa = new Map<string, FranjaDisponible>();
    for (const s of slots) {
      if (!mapa.has(s.hora_inicio)) mapa.set(s.hora_inicio, s);
    }
    return Array.from(mapa.values());
  }, [slots]);

  async function confirmarReserva() {
    if (!slotElegido || !sedeId || !servicioId || !fecha) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/citas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sedeId,
          servicioId,
          profesionalId: profesionalId || slotElegido.profesional_id,
          fecha,
          horaInicioISO: slotElegido.hora_inicio,
          cliente: { nombre, telefono, email: email || null },
          aceptaComercial,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo confirmar la reserva.");
        return;
      }
      setCitaConfirmada({
        inicio: json.cita.inicio,
        profesionalNombre: json.profesionalNombre,
      });
      setPaso("confirmado");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs text-stone-500">
        {["Sede", "Servicio", "Profesional", "Fecha y hora", "Tus datos"].map((etiqueta, i) => (
          <li
            key={etiqueta}
            className={
              "rounded-full px-3 py-1 " +
              (["sede", "servicio", "profesional", "fecha", "datos"][i] === paso
                ? "bg-amber-800 text-white"
                : "bg-stone-100")
            }
          >
            {etiqueta}
          </li>
        ))}
      </ol>

      {paso === "sede" && (
        <div className="space-y-3">
          <h2 className="font-semibold text-stone-800">Elige tu sede</h2>
          {sedes.map((sede) => (
            <button
              key={sede.id}
              onClick={() => {
                setSedeId(sede.id);
                setPaso("servicio");
              }}
              className="w-full rounded-lg border border-stone-200 p-4 text-left hover:border-amber-700 hover:bg-amber-50"
            >
              <div className="font-medium text-stone-900">{sede.nombre}</div>
              {sede.direccion && <div className="text-sm text-stone-500">{sede.direccion}</div>}
            </button>
          ))}
        </div>
      )}

      {paso === "servicio" && (
        <div className="space-y-3">
          <h2 className="font-semibold text-stone-800">
            Servicios en {sedeSeleccionada?.nombre}
          </h2>
          {servicios.map((servicio) => (
            <button
              key={servicio.id}
              onClick={() => elegirServicioYContinuar(servicio.id)}
              className="w-full rounded-lg border border-stone-200 p-4 text-left hover:border-amber-700 hover:bg-amber-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-900">{servicio.nombre}</span>
                <span className="text-stone-700">{formatearPrecio(servicio.precio_centimos)}</span>
              </div>
              <div className="text-sm text-stone-500">{servicio.duracion_minutos} min</div>
            </button>
          ))}
          <button className="text-sm text-stone-500 underline" onClick={() => setPaso("sede")}>
            ← Cambiar de sede
          </button>
        </div>
      )}

      {paso === "profesional" && (
        <div className="space-y-3">
          <h2 className="font-semibold text-stone-800">¿Con quién prefieres ir?</h2>
          <button
            onClick={() => {
              setProfesionalId(null);
              setPaso("fecha");
            }}
            className="w-full rounded-lg border border-stone-200 p-4 text-left hover:border-amber-700 hover:bg-amber-50"
          >
            Cualquier profesional disponible
          </button>
          {profesionales.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProfesionalId(p.id);
                setPaso("fecha");
              }}
              className="w-full rounded-lg border border-stone-200 p-4 text-left hover:border-amber-700 hover:bg-amber-50"
            >
              {p.nombre}
            </button>
          ))}
          <button className="text-sm text-stone-500 underline" onClick={() => setPaso("servicio")}>
            ← Cambiar de servicio
          </button>
        </div>
      )}

      {paso === "fecha" && (
        <div className="space-y-4">
          <h2 className="font-semibold text-stone-800">Elige día y hora</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dias.map((d) => (
              <button
                key={d.valor}
                onClick={() => elegirFecha(d.valor)}
                className={
                  "shrink-0 rounded-lg border px-3 py-2 text-sm capitalize " +
                  (fecha === d.valor
                    ? "border-amber-800 bg-amber-800 text-white"
                    : "border-stone-200 hover:border-amber-700")
                }
              >
                {d.etiqueta}
              </button>
            ))}
          </div>

          {fecha && cargandoSlots && <p className="text-sm text-stone-500">Buscando huecos…</p>}
          {fecha && !cargandoSlots && horasUnicas.length === 0 && (
            <p className="text-sm text-stone-500">No hay huecos ese día. Prueba con otra fecha.</p>
          )}
          {fecha && horasUnicas.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {horasUnicas.map((slot) => {
                const hora = new Date(slot.hora_inicio).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Madrid",
                });
                const elegido = slotElegido?.hora_inicio === slot.hora_inicio;
                return (
                  <button
                    key={slot.hora_inicio + slot.profesional_id}
                    onClick={() => setSlotElegido(slot)}
                    className={
                      "rounded-lg border px-2 py-2 text-sm " +
                      (elegido
                        ? "border-amber-800 bg-amber-800 text-white"
                        : "border-stone-200 hover:border-amber-700")
                    }
                  >
                    {hora}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button className="text-sm text-stone-500 underline" onClick={() => setPaso("profesional")}>
              ← Cambiar profesional
            </button>
            {slotElegido && (
              <button
                onClick={() => setPaso("datos")}
                className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white"
              >
                Continuar
              </button>
            )}
          </div>
        </div>
      )}

      {paso === "datos" && (
        <div className="space-y-4">
          <h2 className="font-semibold text-stone-800">Tus datos</h2>
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-stone-300 p-3"
              placeholder="Nombre y apellidos"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-stone-300 p-3"
              placeholder="Teléfono (WhatsApp)"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-stone-300 p-3"
              placeholder="Email (opcional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              className="mt-1"
              checked={aceptaComercial}
              onChange={(e) => setAceptaComercial(e.target.checked)}
            />
            <span>
              Quiero recibir ofertas y novedades de Barbería Grasso por WhatsApp, email o
              notificaciones. Podré darme de baja cuando quiera. (Opcional: no es necesario
              para reservar tu cita.)
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between">
            <button className="text-sm text-stone-500 underline" onClick={() => setPaso("fecha")}>
              ← Cambiar hora
            </button>
            <button
              disabled={!nombre || !telefono || enviando}
              onClick={confirmarReserva}
              className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {enviando ? "Reservando…" : "Confirmar cita"}
            </button>
          </div>
        </div>
      )}

      {paso === "confirmado" && citaConfirmada && (
        <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-lg font-semibold text-green-800">¡Cita confirmada!</p>
          <p className="text-stone-700">
            {new Date(citaConfirmada.inicio).toLocaleString("es-ES", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Europe/Madrid",
            })}
          </p>
          <p className="text-stone-600">
            {sedeSeleccionada?.nombre} · {servicioSeleccionado?.nombre} · {citaConfirmada.profesionalNombre}
          </p>
          <p className="text-sm text-stone-500">Te avisaremos por WhatsApp antes de tu cita.</p>
        </div>
      )}
    </div>
  );
}

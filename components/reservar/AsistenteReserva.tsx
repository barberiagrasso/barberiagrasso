"use client";

import { useState } from "react";
import { IconSend, IconSparkle } from "@/components/ui/Icons";
import type { OpcionPropuestaCita, ResultadoAsistenteReserva, TurnoConversacionAsistente } from "@/lib/asistenteReserva";

// Pantalla "¿Qué deseas?" — pedida por Diego (25/09/2026): antes del
// paso a paso normal de app/reservar, el cliente escribe en una frase lo
// que quiere y esto le propone una cita ya concreta (ver
// lib/asistenteReserva.ts, /api/reservar/asistente). No reserva nada por
// su cuenta: solo cuando el cliente pulsa "Elegir esta cita" se rellena
// el resto del formulario y sigue el mismo circuito de siempre
// (confirmarReserva en BookingFlow.tsx → POST /api/citas), así que pasa
// por las mismas comprobaciones de disponibilidad y validaciones que una
// reserva hecha a mano.

interface Props {
  onElegirOpcion: (opcion: OpcionPropuestaCita) => void;
  onOmitir: () => void;
}

function formatearPrecio(centimos: number, esVariable: boolean) {
  const texto = (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  return esVariable ? `Desde ${texto}` : texto;
}

function formatearFechaHora(fechaYMD: string, horaInicioISO: string) {
  const fecha = new Date(`${fechaYMD}T12:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Madrid",
  });
  const hora = new Date(horaInicioISO).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
  return `${fecha} · ${hora}`;
}

function TarjetaPropuesta({ opcion, onElegir }: { opcion: OpcionPropuestaCita; onElegir: () => void }) {
  return (
    <div className="rounded-xl border-2 border-brand-yellow/60 bg-white p-4 text-black">
      <p className="font-heading text-base">{opcion.servicioNombre}</p>
      {opcion.complementoNombres.map((nombre) => (
        <p key={nombre} className="text-sm text-black/60">
          + {nombre}
        </p>
      ))}
      <p className="mt-1.5 font-body text-sm text-black/70">{formatearFechaHora(opcion.fecha, opcion.horaInicioISO)}</p>
      <p className="font-body text-sm text-black/70">
        {opcion.sedeNombre} · {opcion.profesionalNombre}
      </p>
      <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-2">
        <span className="font-mono text-base font-semibold">{formatearPrecio(opcion.precioTotalCentimos, opcion.precioEsVariable)}</span>
        <button
          onClick={onElegir}
          className="rounded-full bg-brand-yellow px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark"
        >
          Elegir esta cita
        </button>
      </div>
    </div>
  );
}

export function AsistenteReserva({ onElegirOpcion, onOmitir }: Props) {
  const [mensaje, setMensaje] = useState("");
  const [historial, setHistorial] = useState<TurnoConversacionAsistente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAsistenteReserva | null>(null);
  const [errorRed, setErrorRed] = useState<string | null>(null);

  async function enviar() {
    const texto = mensaje.trim();
    if (!texto || cargando) return;
    setCargando(true);
    setErrorRed(null);
    setMensaje("");
    try {
      const res = await fetch("/api/reservar/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto, historial }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorRed(json.error || "No se pudo procesar tu petición.");
        setHistorial((actual) => [...actual, { remitente: "cliente", contenido: texto }]);
        return;
      }
      const resultadoTyped = json as ResultadoAsistenteReserva;
      setResultado(resultadoTyped);
      setHistorial((actual) => [
        ...actual,
        { remitente: "cliente", contenido: texto },
        { remitente: "ia", contenido: resultadoTyped.mensaje },
      ]);
    } catch {
      setErrorRed("No se pudo conectar con el servidor. Inténtalo de nuevo.");
      setHistorial((actual) => [...actual, { remitente: "cliente", contenido: texto }]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconSparkle className="h-5 w-5 text-brand-yellow" />
        <h2 className="font-heading text-2xl italic text-brand-white">¿Qué deseas?</h2>
      </div>
      <p className="font-body text-sm text-brand-white-dim">
        Cuéntanos qué te gustaría reservar (servicio, día, hora…) y te proponemos una cita ya lista para confirmar.
      </p>

      {resultado?.mensaje && (
        <p className="rounded-xl border border-brand-line bg-brand-black-soft/60 p-3 font-body text-sm text-brand-white">
          {resultado.mensaje}
        </p>
      )}

      {resultado?.tipo === "propuesta" && (
        <div className="space-y-3">
          {resultado.opciones.map((opcion) => (
            <TarjetaPropuesta
              key={`${opcion.horaInicioISO}-${opcion.profesionalId}`}
              opcion={opcion}
              onElegir={() => onElegirOpcion(opcion)}
            />
          ))}
          <p className="font-body text-xs text-brand-white-dim">¿No te encaja? Escríbenos qué cambiar aquí abajo.</p>
        </div>
      )}

      {errorRed && <p className="font-body text-sm text-red-400">{errorRed}</p>}

      <div className="flex items-end gap-2">
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="Ej: quiero cortarme el pelo mañana por la tarde"
          className="min-h-[3rem] w-full flex-1 resize-none rounded-lg border border-brand-line bg-transparent p-3 font-body text-sm text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
        />
        <button
          onClick={enviar}
          disabled={!mensaje.trim() || cargando}
          aria-label="Enviar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconSend className="h-4 w-4" />
        </button>
      </div>
      {cargando && <p className="font-body text-xs text-brand-white-dim">Buscando el mejor hueco…</p>}

      <div className="pt-1 text-center">
        <button
          onClick={onOmitir}
          className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 transition-colors hover:text-brand-yellow"
        >
          Prefiero elegirlo paso a paso
        </button>
      </div>
    </div>
  );
}

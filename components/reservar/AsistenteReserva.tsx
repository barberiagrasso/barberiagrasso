"use client";

import { useState } from "react";
import { IconSend } from "@/components/ui/Icons";
import type { OpcionPropuestaCita, ResultadoAsistenteReserva, TurnoConversacionAsistente } from "@/lib/asistenteReserva";

// Atajo dentro del primer paso de app/reservar ("Elige tu sede", ver
// BookingFlow.tsx) — pedido por Diego (25/09/2026): el cliente puede
// escribir en una frase lo que quiere y se le propone una cita ya
// concreta (ver lib/asistenteReserva.ts, /api/reservar/asistente), sin
// competir visualmente con el paso a paso normal que sigue justo debajo.
// A propósito se presenta como una caja de texto más de la app (mismo
// estilo que los campos de "Tus datos"), no como un "chat con una IA":
// sin cabecera, sin icono de estrellitas, sin enfatizar que hay un
// modelo detrás. No reserva nada por su cuenta: solo cuando el cliente
// pulsa "Elegir esta cita" se rellena el resto del formulario y sigue el
// mismo circuito de siempre (confirmarReserva en BookingFlow.tsx → POST
// /api/citas).

interface Props {
  onElegirOpcion: (opcion: OpcionPropuestaCita) => void;
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
    <div className="rounded-xl border-2 border-brand-yellow/50 bg-white p-3.5 text-black">
      <p className="font-heading text-sm">{opcion.servicioNombre}</p>
      {opcion.complementoNombres.map((nombre) => (
        <p key={nombre} className="text-xs text-black/60">
          + {nombre}
        </p>
      ))}
      <p className="mt-1 font-body text-xs text-black/60">{formatearFechaHora(opcion.fecha, opcion.horaInicioISO)}</p>
      <p className="font-body text-xs text-black/60">
        {opcion.sedeNombre} · {opcion.profesionalNombre}
      </p>
      <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-2">
        <span className="font-mono text-sm font-semibold">{formatearPrecio(opcion.precioTotalCentimos, opcion.precioEsVariable)}</span>
        <button
          onClick={onElegir}
          className="rounded-full bg-brand-yellow px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark"
        >
          Elegir esta cita
        </button>
      </div>
    </div>
  );
}

export function AsistenteReserva({ onElegirOpcion }: Props) {
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
    <div className="mb-4 space-y-2">
      <div className="relative">
        <input
          type="text"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              enviar();
            }
          }}
          maxLength={500}
          placeholder="O dinos qué te apetece reservar…"
          className="w-full rounded-lg border border-brand-line bg-transparent py-2.5 pl-3 pr-10 font-body text-sm text-brand-white placeholder:text-brand-white-dim focus:border-brand-yellow focus:outline-none"
        />
        <button
          onClick={enviar}
          disabled={!mensaje.trim() || cargando}
          aria-label="Enviar"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-brand-white-dim transition-colors hover:text-brand-yellow disabled:cursor-not-allowed disabled:opacity-30"
        >
          <IconSend className="h-3.5 w-3.5" />
        </button>
      </div>

      {cargando && <p className="font-body text-xs text-brand-white-dim">Buscando el mejor hueco…</p>}
      {errorRed && <p className="font-body text-xs text-red-400">{errorRed}</p>}

      {!cargando && resultado?.mensaje && (
        <p className="font-body text-xs text-brand-white-dim">{resultado.mensaje}</p>
      )}

      {!cargando && resultado?.tipo === "propuesta" && (
        <div className="space-y-2 pt-0.5">
          {resultado.opciones.map((opcion) => (
            <TarjetaPropuesta
              key={`${opcion.horaInicioISO}-${opcion.profesionalId}`}
              opcion={opcion}
              onElegir={() => onElegirOpcion(opcion)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

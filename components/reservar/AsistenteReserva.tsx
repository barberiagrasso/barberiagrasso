"use client";

import { useEffect, useRef, useState } from "react";
import { IconMic, IconSend } from "@/components/ui/Icons";
import type { OpcionPropuestaCita, ResultadoAsistenteReserva, TurnoConversacionAsistente } from "@/lib/asistenteReserva";

// Buscador por texto libre de la portada (ver AsistenteReservaInicio.tsx),
// pedido por Diego (25/09/2026): el cliente puede escribir en una frase lo
// que quiere y se le propone una cita ya concreta (ver lib/asistenteReserva.ts,
// /api/reservar/asistente). No reserva nada por su cuenta: solo cuando el
// cliente pulsa "Elegir esta cita" se traslada la propuesta a /reservar.
//
// Rediseño pedido por Diego (25/09/2026): que la caja parezca la de una
// app de mensajería (fondo blanco, letra negra) en vez de un campo más del
// formulario, y que se pueda "enviar un audio". La IA solo entiende texto,
// así que el audio se transcribe en el propio teléfono con el reconocimiento
// de voz del navegador (Web Speech API) — sin coste ni servicio externo — y
// el texto reconocido se envía igual que si se hubiera escrito. Si el
// navegador no lo soporta (por ejemplo Firefox, o algunos Android antiguos),
// el botón de micrófono no se muestra: solo queda el envío por texto.

interface Props {
  onElegirOpcion: (opcion: OpcionPropuestaCita) => void;
}

// Tipos mínimos para la Web Speech API — no forma parte de los tipos DOM
// estándar de TypeScript, así que solo se tipa lo que usamos aquí: crear un
// reconocedor, arrancarlo/pararlo y leer el texto reconocido.
interface ResultadoReconocimientoVoz {
  readonly isFinal: boolean;
  readonly length: number;
  [indice: number]: { readonly transcript: string };
}

interface EventoReconocimientoVoz extends Event {
  readonly results: ArrayLike<ResultadoReconocimientoVoz>;
}

interface EventoErrorReconocimientoVoz extends Event {
  readonly error: string;
}

interface ReconocedorVoz extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: EventoReconocimientoVoz) => void) | null;
  onerror: ((ev: EventoErrorReconocimientoVoz) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ReconocedorVoz;
    webkitSpeechRecognition?: new () => ReconocedorVoz;
  }
}

function obtenerConstructorReconocimiento(): (new () => ReconocedorVoz) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function mensajeErrorVoz(codigo: string): string {
  if (codigo === "not-allowed" || codigo === "service-not-allowed") {
    return "No hemos podido acceder al micrófono. Revisa los permisos o escribe tu petición.";
  }
  if (codigo === "no-speech") {
    return "No se ha detectado voz. Inténtalo de nuevo o escribe tu petición.";
  }
  return "No se ha podido usar el micrófono. Escribe tu petición.";
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
  const [escuchando, setEscuchando] = useState(false);
  const [vozDisponible, setVozDisponible] = useState(false);
  const reconocedorRef = useRef<ReconocedorVoz | null>(null);

  useEffect(() => {
    setVozDisponible(Boolean(obtenerConstructorReconocimiento()));
    return () => {
      reconocedorRef.current?.stop();
    };
  }, []);

  async function enviarTexto(texto: string) {
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

  function enviar() {
    enviarTexto(mensaje.trim());
  }

  function iniciarEscucha() {
    if (cargando || escuchando) return;
    const Reconocedor = obtenerConstructorReconocimiento();
    if (!Reconocedor) return;

    // Variable de cierre (no estado) para tener siempre el último texto
    // reconocido a mano en onend, sin depender de renders anteriores.
    let textoReconocido = "";
    const reconocedor = new Reconocedor();
    reconocedor.lang = "es-ES";
    reconocedor.interimResults = true;
    reconocedor.continuous = false;
    reconocedor.maxAlternatives = 1;

    reconocedor.onresult = (ev) => {
      let texto = "";
      for (let i = 0; i < ev.results.length; i++) {
        texto += ev.results[i][0].transcript;
      }
      textoReconocido = texto;
      setMensaje(texto);
    };
    reconocedor.onerror = (ev) => {
      setEscuchando(false);
      reconocedorRef.current = null;
      setErrorRed(mensajeErrorVoz(ev.error));
    };
    reconocedor.onend = () => {
      setEscuchando(false);
      reconocedorRef.current = null;
      const texto = textoReconocido.trim();
      if (texto) enviarTexto(texto);
    };

    reconocedorRef.current = reconocedor;
    setMensaje("");
    setErrorRed(null);
    setEscuchando(true);
    reconocedor.start();
  }

  function detenerEscucha() {
    reconocedorRef.current?.stop();
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white py-1.5 pl-4 pr-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
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
          readOnly={escuchando}
          maxLength={500}
          placeholder={escuchando ? "Escuchando…" : "O dinos qué te apetece reservar…"}
          className="min-w-0 flex-1 bg-transparent py-1 font-body text-sm text-black placeholder:text-black/40 focus:outline-none"
        />

        {escuchando ? (
          <button
            onClick={detenerEscucha}
            aria-label="Detener grabación"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/60" />
            <IconMic className="relative h-4 w-4" />
          </button>
        ) : mensaje.trim() ? (
          <button
            onClick={enviar}
            disabled={cargando}
            aria-label="Enviar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconSend className="h-3.5 w-3.5" />
          </button>
        ) : vozDisponible ? (
          <button
            onClick={iniciarEscucha}
            disabled={cargando}
            aria-label="Enviar un audio"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/50 transition-colors hover:bg-black/5 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconMic className="h-4 w-4" />
          </button>
        ) : (
          <button disabled aria-label="Enviar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/25">
            <IconSend className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {escuchando && <p className="font-body text-xs text-brand-white-dim">Escuchando… habla y se enviará solo.</p>}
      {cargando && <p className="font-body text-xs text-brand-white-dim">Buscando el mejor hueco…</p>}
      {errorRed && <p className="font-body text-xs text-red-400">{errorRed}</p>}

      {!cargando && !escuchando && resultado?.mensaje && (
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

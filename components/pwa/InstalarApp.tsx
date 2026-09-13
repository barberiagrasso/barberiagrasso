"use client";

import { useEffect, useState } from "react";

const CLAVE_DESCARTADO = "grasso:instalar-app:descartado-el";
const DIAS_ANTES_DE_VOLVER_A_PREGUNTAR = 14;

// Chrome/Android disparan este evento cuando la web cumple los
// requisitos de instalación (manifest + service worker); no forma parte
// todavía de los tipos de TypeScript del DOM.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function yaEstaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  const enStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(enStandalone || iosStandalone);
}

function descartadaRecientemente(): boolean {
  try {
    const guardado = localStorage.getItem(CLAVE_DESCARTADO);
    if (!guardado) return false;
    const dias = (Date.now() - Number(guardado)) / (1000 * 60 * 60 * 24);
    return dias < DIAS_ANTES_DE_VOLVER_A_PREGUNTAR;
  } catch {
    return false; // si falla localStorage (navegación privada...), mejor mostrarlo que no
  }
}

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Aviso para instalar la web como app en el móvil, pensado para
 * /reservar (el punto de entrada habitual de un cliente). En
 * Android/Chrome usa el prompt nativo; en iOS Safari no existe ese
 * prompt, así que se le explican los dos toques necesarios.
 */
export default function InstalarApp() {
  const [eventoInstalacion, setEventoInstalacion] = useState<BeforeInstallPromptEvent | null>(null);
  const [mostrarInstruccionesIOS, setMostrarInstruccionesIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (yaEstaInstalada() || descartadaRecientemente()) return;

    if (esIOS()) {
      // Solo Safari (no los navegadores de terceros en iOS, que no
      // pueden añadir a pantalla de inicio aunque compartan motor).
      const esSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
      if (esSafari) {
        setMostrarInstruccionesIOS(true);
        setVisible(true);
      }
      return;
    }

    function alCapturarPrompt(e: Event) {
      e.preventDefault();
      setEventoInstalacion(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", alCapturarPrompt);
    return () => window.removeEventListener("beforeinstallprompt", alCapturarPrompt);
  }, []);

  function descartar() {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()));
    } catch {
      // sin localStorage no se puede recordar el descarte; no pasa nada grave
    }
  }

  async function instalar() {
    if (!eventoInstalacion) return;
    await eventoInstalacion.prompt();
    await eventoInstalacion.userChoice;
    setEventoInstalacion(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-yellow/30 bg-brand-black-soft p-3 text-left">
      <div className="flex-1">
        {mostrarInstruccionesIOS ? (
          <p className="font-body text-sm text-brand-white-dim">
            <span className="font-semibold text-brand-white">Instala esta web como app:</span> toca{" "}
            <span className="text-brand-yellow">Compartir</span> (el icono con la flecha) y luego{" "}
            <span className="text-brand-yellow">&ldquo;Añadir a pantalla de inicio&rdquo;</span>.
          </p>
        ) : (
          <>
            <p className="font-body text-sm text-brand-white">Instala Barbería Grasso en tu móvil</p>
            <p className="mt-0.5 font-body text-xs text-brand-white-dim">
              Acceso directo desde tu pantalla de inicio, sin buscar el enlace cada vez.
            </p>
            <button
              onClick={instalar}
              className="mt-2 rounded-full bg-brand-yellow px-4 py-1.5 font-body text-xs font-semibold uppercase tracking-wide text-brand-yellow-ink hover:bg-brand-yellow-dark"
            >
              Instalar
            </button>
          </>
        )}
      </div>
      <button
        onClick={descartar}
        aria-label="Cerrar aviso de instalación"
        className="shrink-0 font-body text-brand-white-dim hover:text-brand-white"
      >
        ✕
      </button>
    </div>
  );
}

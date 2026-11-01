"use client";

import { useEffect, useState } from "react";

// Botón SIEMPRE visible en la portada (salvo si ya se abrió como app)
// para añadir Grasso a la pantalla de inicio (pedido de David,
// 01/11/2026). En Android/Chrome abre el aviso nativo de instalar; en el
// iPhone (que no tiene ese aviso) enseña los pasos con dibujitos.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Sistema = "ios-safari" | "ios-otro" | "android" | "app-interna" | "otro";

function detectarSistema(): Sistema {
  const ua = navigator.userAgent;
  // Navegadores de dentro de Instagram, Facebook, WhatsApp, TikTok…: no dejan instalar.
  if (/instagram|fban|fbav|fb_iab|whatsapp|tiktok|bytedance|line\//i.test(ua)) return "app-interna";
  if (/iphone|ipad|ipod/i.test(ua)) return /crios|fxios|edgios/i.test(ua) ? "ios-otro" : "ios-safari";
  if (/android/i.test(ua)) return "android";
  return "otro";
}

function yaEstaInstalada(): boolean {
  const enStandalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(enStandalone || iosStandalone);
}

// Icono de "Compartir" de iOS (cuadrado con flecha hacia arriba).
function IconoCompartir() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function IconoMas() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

export function BotonInstalarApp() {
  const [listo, setListo] = useState(false);
  const [instalada, setInstalada] = useState(false);
  const [sistema, setSistema] = useState<Sistema>("otro");
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setInstalada(yaEstaInstalada());
    setSistema(detectarSistema());
    setListo(true);
    function alCapturar(e: Event) {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    }
    function alInstalar() {
      setInstalada(true);
      setAbierto(false);
    }
    window.addEventListener("beforeinstallprompt", alCapturar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alCapturar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!listo || instalada) return null;

  async function pulsar() {
    if (evento) {
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      setEvento(null);
      if (outcome === "accepted") setInstalada(true);
      return;
    }
    setAbierto(true);
  }

  return (
    <>
      <button
        onClick={pulsar}
        className="mt-5 flex items-center gap-2 rounded-full bg-brand-yellow px-6 py-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-opacity hover:opacity-90"
      >
        <IconoMas />
        Añadir Grasso a mi pantalla de inicio
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setAbierto(false)}>
          <div
            role="dialog"
            aria-label="Cómo añadir Grasso a la pantalla de inicio"
            className="w-full max-w-sm rounded-2xl border border-brand-yellow/40 bg-brand-black-soft p-5 text-left font-body text-brand-white"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-heading text-xl italic text-brand-yellow">Tenla como una app</p>
            <p className="mt-1 text-sm text-brand-white-dim">Así reservas en dos toques, sin buscar el enlace.</p>

            <ol className="mt-4 space-y-3 text-sm">
              {sistema === "ios-safari" && (
                <>
                  <li>
                    <b>1.</b> Toca <span className="text-brand-yellow">Compartir</span> <IconoCompartir /> abajo en la barra de Safari
                    (si no la ves, toca los <b>tres puntos</b> o desliza un poco hacia arriba).
                  </li>
                  <li>
                    <b>2.</b> Baja y toca <span className="text-brand-yellow">“Añadir a pantalla de inicio”</span> <IconoMas />.
                  </li>
                  <li>
                    <b>3.</b> Toca <span className="text-brand-yellow">“Añadir”</span> arriba a la derecha. ¡Listo!
                  </li>
                </>
              )}
              {sistema === "ios-otro" && (
                <>
                  <li>
                    <b>1.</b> Toca <span className="text-brand-yellow">Compartir</span> <IconoCompartir /> (arriba, junto a la dirección).
                  </li>
                  <li>
                    <b>2.</b> Toca <span className="text-brand-yellow">“Añadir a pantalla de inicio”</span>.
                  </li>
                  <li>
                    <b>3.</b> Si no te sale, abre <b>barberiagrasso.vercel.app</b> en <b>Safari</b> y repite.
                  </li>
                </>
              )}
              {sistema === "android" && (
                <>
                  <li>
                    <b>1.</b> Toca el menú <span className="text-brand-yellow">⋮</span> (arriba a la derecha de Chrome).
                  </li>
                  <li>
                    <b>2.</b> Toca <span className="text-brand-yellow">“Instalar aplicación”</span> o{" "}
                    <span className="text-brand-yellow">“Añadir a pantalla de inicio”</span>.
                  </li>
                  <li>
                    <b>3.</b> Confirma con <span className="text-brand-yellow">“Instalar”</span>. ¡Listo!
                  </li>
                </>
              )}
              {sistema === "app-interna" && (
                <>
                  <li>
                    <b>1.</b> Estás dentro de otra app (Instagram, WhatsApp…). Toca los <b>tres puntos</b> o el icono de abrir.
                  </li>
                  <li>
                    <b>2.</b> Elige <span className="text-brand-yellow">“Abrir en Safari”</span> o{" "}
                    <span className="text-brand-yellow">“Abrir en Chrome”</span>.
                  </li>
                  <li>
                    <b>3.</b> Vuelve a tocar este botón y sigue los pasos.
                  </li>
                </>
              )}
              {sistema === "otro" && (
                <li>
                  Abre esta página en el móvil (Safari en iPhone, Chrome en Android) y toca este botón para ver los pasos.
                </li>
              )}
            </ol>

            <button
              onClick={() => setAbierto(false)}
              className="mt-5 w-full rounded-none bg-brand-white p-3 text-sm font-semibold uppercase tracking-wide text-brand-black"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import ConversacionesPanel from "./conversaciones/ConversacionesPanel";

const INTERVALO_COMPROBACION_MS = 20_000;

/**
 * Burbuja flotante de WhatsApp, visible en todo el panel (antes era una
 * pestaña propia del menú — ver AdminNav.tsx): un botón pequeño y poco
 * invasivo en una esquina que, al pulsarlo, abre encima de lo que se
 * esté viendo el mismo panel de conversaciones de siempre
 * (ConversacionesPanel.tsx). Un puntito rojo avisa si hay alguna
 * conversación escalada esperando respuesta, aunque el popup esté
 * cerrado — el aviso ámbar de arriba del panel (ver layout.tsx) ya
 * cumplía este papel para el enlace de página completa; este es el
 * mismo aviso, pero en el sitio nuevo.
 *
 * El icono es una burbuja de chat genérica en el verde de WhatsApp, no
 * el logo real de Meta — basta para que se reconozca de un vistazo sin
 * reproducir una marca ajena.
 */
export default function WhatsAppFlotante() {
  const [abierto, setAbierto] = useState(false);
  const [hayEscaladas, setHayEscaladas] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function comprobar() {
      try {
        const res = await fetch("/api/admin/conversaciones");
        const json = await res.json();
        if (cancelado) return;
        const conversaciones: { estado?: string }[] = json.conversaciones ?? [];
        setHayEscaladas(conversaciones.some((c) => c.estado === "escalada"));
      } catch {
        // Sin conexión puntual: no pasa nada, se reintenta en el
        // siguiente ciclo — no es un dato crítico para bloquear nada.
      }
    }
    void comprobar();
    const intervalo = setInterval(comprobar, INTERVALO_COMPROBACION_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label="Conversaciones de WhatsApp"
        title="Conversaciones de WhatsApp"
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
          <path d="M12 3a9 9 0 0 0-7.79 13.5L3 21l4.65-1.19A9 9 0 1 0 12 3Zm0 2a7 7 0 1 1-3.77 12.9l-.27-.17-2.76.71.73-2.69-.18-.28A7 7 0 0 1 12 5Zm-2.9 3.7c-.18 0-.47.07-.71.34-.24.27-.94.9-.94 2.2s.96 2.56 1.1 2.74c.13.18 1.86 2.93 4.6 3.99 2.28.88 2.74.7 3.24.66.5-.05 1.6-.65 1.83-1.28.22-.63.22-1.17.16-1.28-.07-.11-.25-.18-.53-.32-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.31.2-.59.07-.27-.14-1.15-.42-2.19-1.35-.81-.72-1.36-1.61-1.52-1.88-.16-.27-.02-.42.12-.55.12-.13.27-.32.4-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.48-.84-2.02-.22-.53-.44-.46-.61-.47Z" />
        </svg>
        {hayEscaladas && (
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500" />
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setAbierto(false)}>
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">WhatsApp</h2>
              <button onClick={() => setAbierto(false)} className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Cerrar">
                ✕
              </button>
            </div>
            <ConversacionesPanel />
          </div>
        </div>
      )}
    </>
  );
}

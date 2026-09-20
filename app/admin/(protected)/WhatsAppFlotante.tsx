"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
 * El icono es el logo real de WhatsApp (PNG que dio Diego, en
 * public/icons/whatsapp.png) — antes era una burbuja de chat genérica
 * dibujada a mano que se veía descuadrada dentro del círculo.
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
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg shadow-black/20 transition-transform hover:scale-105 active:scale-95"
      >
        <Image src="/icons/whatsapp.png" alt="WhatsApp" width={56} height={56} className="h-full w-full object-cover" />
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

"use client";

import { useEffect } from "react";

// Sin esto, el navegador nunca considera "instalable" la web aunque
// tenga manifest: hace falta un service worker registrado. No pinta
// nada — solo lo registra, en segundo plano, en cualquier página.
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("No se pudo registrar el service worker", err);
    });
  }, []);

  return null;
}

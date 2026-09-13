"use client";

import { useEffect } from "react";

// Última red de seguridad si algo revienta tan pronto (en el propio
// layout raíz) que ni siquiera se puede pintar la página normal. Debe
// definir sus propias etiquetas <html>/<body> porque sustituye por
// completo al layout raíz mientras está activo (ver app/layout.tsx).
// Usa estilos en línea a propósito, sin depender de globals.css ni de
// Tailwind, para que se vea bien incluso si el problema viene de ahí.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    fetch("/api/errores/reportar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: error.message, digest: error.digest, pagina: "global-error" }),
    }).catch(() => {
      // Si ni esto funciona, no hay nada más que hacer: ya queda el
      // console.error de abajo como último rastro.
    });
    console.error("Error global no capturado", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b0b0a",
          color: "#f5f1e6",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8, color: "#f2d368" }}>Algo ha fallado</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.85, marginBottom: 20 }}>
            Ha ocurrido un error inesperado. Ya ha quedado anotado; puedes intentarlo de nuevo o llamarnos
            directamente si necesitas reservar con urgencia.
          </p>
          <button
            onClick={() => retry()}
            style={{
              backgroundColor: "#f2d368",
              color: "#2a2107",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}

"use client";

import { useEffect } from "react";

// Red de seguridad para errores de render dentro del panel de admin: la
// cabecera y el menú (definidos en layout.tsx) se quedan puestos, solo se
// sustituye la pantalla que ha fallado — así Diego nunca se queda sin
// forma de navegar a otra sección aunque una tabla o gráfica reviente.
export default function ErrorAdmin({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    fetch("/api/errores/reportar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: error.message, digest: error.digest, pagina: "admin" }),
    }).catch(() => {});
    console.error("Error de render en el panel de admin", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <h2 className="mb-1 text-lg font-bold text-red-900">Esta pantalla ha fallado</h2>
      <p className="mb-4 text-sm text-red-800">
        Ya ha quedado anotado en <span className="font-mono">/admin/errores</span>. Prueba a recargar; si se repite,
        dile a Claude qué estabas haciendo cuando pasó.
      </p>
      <button
        onClick={() => retry()}
        className="rounded-lg bg-red-900 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
      >
        Reintentar
      </button>
    </div>
  );
}

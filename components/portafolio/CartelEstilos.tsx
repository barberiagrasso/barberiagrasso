"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Cartel "¿Qué estilo llevas hoy?". Al tocarlo se abre DENTRO de la app
// (no en otra pestaña: en la app instalada del iPhone no había forma de
// volver). Se puede mover con el dedo para ver los detalles y se cierra
// con el botón, tocando fuera o con Escape.
export function CartelEstilos() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [abierto]);

  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          marginBottom: 8,
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          textAlign: "center",
          opacity: 0.85,
        }}
      >
        ¿Qué estilo llevas hoy?
      </h2>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Ver la guía de estilos en grande"
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          overflow: "hidden",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "none",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/media/cartel-estilos.jpg"
          alt="Guía de estilos de Barbería Grasso: cortes, barbas, cortes infantiles y servicios"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </button>
      <p style={{ marginTop: 6, textAlign: "center", fontSize: 12, opacity: 0.7 }}>
        Toca la imagen para verla en grande.
      </p>
      <Link
        href="/estilo"
        style={{
          display: "block",
          marginTop: 12,
          padding: "12px 16px",
          textAlign: "center",
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 12,
          border: "1px solid rgba(240,200,40,0.5)",
        }}
      >
        ✨ ¿No sabes cuál elegir? Descubre tu estilo con IA
      </Link>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Guía de estilos"
          onClick={() => setAbierto(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#0b0b0a",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "calc(12px + env(safe-area-inset-top)) 16px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span style={{ fontSize: 13, opacity: 0.75 }}>Mueve la imagen con el dedo</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAbierto(false);
              }}
              style={{
                minHeight: 44,
                padding: "8px 20px",
                borderRadius: 999,
                background: "#f4efe4",
                color: "#0b0b0a",
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Cerrar
            </button>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              overflow: "auto",
              WebkitOverflowScrolling: "touch",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/cartel-estilos.jpg"
              alt="Guía de estilos de Barbería Grasso"
              style={{ display: "block", width: "230%", maxWidth: "none", height: "auto" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            style={{
              margin: "8px 16px calc(12px + env(safe-area-inset-bottom))",
              minHeight: 48,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.25)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ← Volver
          </button>
        </div>
      )}
    </section>
  );
}

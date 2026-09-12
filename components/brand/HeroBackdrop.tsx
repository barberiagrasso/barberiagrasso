"use client";

import { useEffect, useState } from "react";

interface Clip {
  src: string;
  poster: string;
}

const CLIPS: Clip[] = [
  { src: "/media/hero/hero-1-textura.mp4", poster: "/media/hero/hero-1-textura-poster.jpg" },
  { src: "/media/hero/hero-2-afeitado.mp4", poster: "/media/hero/hero-2-afeitado-poster.jpg" },
  { src: "/media/hero/hero-3-local.mp4", poster: "/media/hero/hero-3-local-poster.jpg" },
];

const DURACION_MS = 9000;

/**
 * Fondo ambiental de la home: 3 clips reales de la barbería en bucle,
 * encadenados con un fundido suave. Puramente decorativo — no lleva
 * sonido, controles ni nada interactivo, así que nunca compite con el
 * contenido de encima. Respeta prefers-reduced-motion mostrando solo
 * una foto fija.
 */
export function HeroBackdrop() {
  const [activo, setActivo] = useState(0);
  const [movimientoReducido, setMovimientoReducido] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setMovimientoReducido(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (movimientoReducido) return;
    const id = setInterval(() => {
      setActivo((i) => (i + 1) % CLIPS.length);
    }, DURACION_MS);
    return () => clearInterval(id);
  }, [movimientoReducido]);

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-brand-black">
      {movimientoReducido ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={CLIPS[0].poster}
          alt=""
          className="h-full w-full scale-105 object-cover opacity-70"
        />
      ) : (
        CLIPS.map((clip, i) => (
          <video
            key={clip.src}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={clip.poster}
            className="absolute inset-0 h-full w-full scale-105 object-cover transition-opacity ease-in-out"
            style={{
              opacity: i === activo ? 0.7 : 0,
              transitionDuration: "1800ms",
            }}
          >
            <source src={clip.src} type="video/mp4" />
          </video>
        ))
      )}

      {/* Textura de grano muy sutil, para que no se vea "plano" */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Viñeta + degradado para que el logo y los textos sigan siendo legibles */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-black/80 via-brand-black/55 to-brand-black/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_35%,_rgba(11,11,10,0.75)_100%)]" />
    </div>
  );
}

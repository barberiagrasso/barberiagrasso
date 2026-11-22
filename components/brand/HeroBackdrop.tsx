"use client";

import { useEffect, useRef, useState } from "react";

interface Clip {
  src: string;
  poster: string;
}

const CLIPS: Clip[] = [
  {
    src: "/media/hero/hero-1-textura.mp4",
    poster: "/media/hero/hero-1-textura-poster.jpg",
  },
  {
    src: "/media/hero/hero-2-afeitado.mp4",
    poster: "/media/hero/hero-2-afeitado-poster.jpg",
  },
  {
    src: "/media/hero/hero-3-local.mp4",
    poster: "/media/hero/hero-3-local-poster.jpg",
  },
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
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  // Solo se muestra el vídeo cuando de verdad está reproduciéndose; si no,
  // queda la foto fija de debajo (en iPhone con ahorro de energía el
  // navegador no deja arrancar vídeos solos y antes se veía parado).
  const [reproduciendo, setReproduciendo] = useState<boolean[]>([]);
  const marcar = (i: number, valor: boolean) =>
    setReproduciendo((r) => {
      const n = [...r];
      n[i] = valor;
      return n;
    });
  // Al abrir la app solo se descarga el primer clip; los otros dos (casi
  // 1 MB más) esperan unos segundos para no frenar la carga de la
  // pantalla, que es lo que el cliente necesita ver primero.
  const [cargarResto, setCargarResto] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCargarResto(true), 4000);
    return () => clearTimeout(id);
  }, []);

  // A veces el navegador deja un vídeo en pausa o congelado por su cuenta
  // (cambio de pestaña, ahorro de batería, red lenta, hipo del autoplay) y,
  // como aquí no hay controles, se quedaría parado para siempre.
  // Estas funciones lo reanudan y, si hace falta, lo recargan.
  const ultimoTiempo = useRef<number[]>([]);
  const congelado = useRef<number[]>([]);
  const visible = useRef<boolean[]>([]);

  function intentarReanudar(video: HTMLVideoElement | null) {
    if (!video) return;
    // iOS solo deja arrancar solo si el silencio está puesto como propiedad
    // (React a veces solo pone el atributo).
    video.muted = true;
    video.defaultMuted = true;
    if (video.paused || video.ended) video.play().catch(() => {});
  }

  function recargar(video: HTMLVideoElement | null) {
    if (!video) return;
    try {
      video.load();
    } catch {}
    intentarReanudar(video);
  }

  function reanudarTodos() {
    videoRefs.current.forEach(intentarReanudar);
  }

  function ponerVisible(i: number, valor: boolean) {
    if (visible.current[i] === valor) return;
    visible.current[i] = valor;
    marcar(i, valor);
  }

  // Vigilante: cada 1,5 s comprueba que el tiempo de cada vídeo avanza de
  // verdad. Si no avanza, oculta ese vídeo (se ve la foto, nunca un
  // fotograma congelado) e intenta arreglarlo: primero play(), y si sigue
  // igual, recarga el vídeo.
  useEffect(() => {
    if (movimientoReducido) return;
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      videoRefs.current.forEach((v, i) => {
        if (!v) return;
        const antes = ultimoTiempo.current[i] ?? -1;
        const ahora = v.currentTime;
        ultimoTiempo.current[i] = ahora;
        const avanza =
          !v.paused && !v.ended && v.readyState >= 2 && Math.abs(ahora - antes) > 0.05;
        if (avanza) {
          congelado.current[i] = 0;
          ponerVisible(i, true);
          return;
        }
        const n = (congelado.current[i] ?? 0) + 1;
        congelado.current[i] = n;
        if (n >= 2) ponerVisible(i, false);
        if (n === 1 || n === 2) intentarReanudar(v);
        else if (n >= 3 && n % 3 === 0) {
          // Sigue sin avanzar: recarga completa del vídeo.
          recargar(v);
        } else intentarReanudar(v);
      });
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientoReducido, cargarResto]);

  // Reintentos al volver a la página, recuperar el foco o tocar la
  // pantalla (el modo de bajo consumo de iPhone solo deja arrancar tras un
  // gesto del usuario).
  useEffect(() => {
    if (movimientoReducido) return;
    const reintentar = () => reanudarTodos();
    const onVis = () => {
      if (document.visibilityState === "visible") reanudarTodos();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", reintentar);
    window.addEventListener("focus", reintentar);
    window.addEventListener("online", reintentar);
    window.addEventListener("touchstart", reintentar, { passive: true });
    window.addEventListener("click", reintentar, { passive: true });
    window.addEventListener("scroll", reintentar, { passive: true });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", reintentar);
      window.removeEventListener("focus", reintentar);
      window.removeEventListener("online", reintentar);
      window.removeEventListener("touchstart", reintentar);
      window.removeEventListener("click", reintentar);
      window.removeEventListener("scroll", reintentar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientoReducido]);

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

  // Al cambiar de clip nos aseguramos de que el nuevo esté reproduciéndose.
  useEffect(() => {
    reanudarTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-brand-black"
    >
      {/* Foto fija de fondo: siempre visible si el vídeo no puede arrancar */}
      {!movimientoReducido && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={CLIPS[activo].poster}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-70 transition-opacity duration-[1800ms]"
        />
      )}

      {movimientoReducido ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={CLIPS[0].poster}
          alt=""
          className="h-full w-full scale-105 object-cover opacity-70"
        />
      ) : (
        CLIPS.map((clip, i) => (i > 0 && !cargarResto ? null : (
          <video
            key={clip.src}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={() => {
              ultimoTiempo.current[i] = -1;
              congelado.current[i] = 0;
            }}
            onPause={(e) => intentarReanudar(e.currentTarget)}
            onWaiting={() => {
              congelado.current[i] = Math.max(congelado.current[i] ?? 0, 1);
            }}
            onStalled={(e) => intentarReanudar(e.currentTarget)}
            onSuspend={(e) => intentarReanudar(e.currentTarget)}
            onEnded={(e) => intentarReanudar(e.currentTarget)}
            onCanPlay={(e) => intentarReanudar(e.currentTarget)}
            onError={(e) => {
              ponerVisible(i, false);
              const v = e.currentTarget;
              setTimeout(() => recargar(v), 2000);
            }}
            disablePictureInPicture
            className="absolute inset-0 h-full w-full scale-105 object-cover transition-opacity ease-in-out"
            style={{
              opacity: i === activo && reproduciendo[i] ? 0.7 : 0,
              transitionDuration: "1800ms",
            }}
          >
            <source src={clip.src} type="video/mp4" />
          </video>
        )))
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

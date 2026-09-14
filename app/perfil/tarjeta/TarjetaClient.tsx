"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  nombre: string;
  saldoFidelizacionCentimos: number;
  walletAppleDisponible: boolean;
  walletGoogleDisponible: boolean;
}

function formatearPrecio(centimos: number) {
  return (centimos / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// Medidas de una tarjeta de fidelización horizontal, a doble resolución
// (@2x) para que se vea nítida también en móviles de pantalla densa.
const ANCHO = 1000;
const ALTO = 620;

/**
 * Dibuja la tarjeta en un <canvas> oculto y la vuelca como PNG — es la
 * "tarjeta digital" que cualquier cliente puede descargar y guardar hoy
 * mismo, sin depender de que Diego active Apple/Google Wallet. Vive
 * aparte de los botones de Wallet real (ver más abajo) porque no
 * necesita ninguna cuenta de desarrollador ni backend: se genera entera
 * en el navegador del cliente.
 */
export default function TarjetaClient({ nombre, saldoFidelizacionCentimos, walletAppleDisponible, walletGoogleDisponible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lista, setLista] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [avisoWallet, setAvisoWallet] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function dibujar() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = ANCHO;
      canvas.height = ALTO;

      // Espera a que la tipografía de la marca esté cargada (ya la trae
      // app/layout.tsx) para que el canvas no dibuje con una genérica de
      // sistema antes de tiempo.
      try {
        await Promise.all([
          document.fonts.load("700 44px Lato"),
          document.fonts.load("400 30px Lato"),
          document.fonts.load("300 26px Lato"),
        ]);
      } catch {
        // Si falla la carga de la fuente, se dibuja igualmente con la
        // que el navegador use por defecto — mejor una tarjeta con otra
        // tipografía que ninguna tarjeta.
      }
      if (cancelado) return;

      // Fondo con un degradado sutil, igual de oscuro que el resto de la
      // app (--brand-black / --brand-black-soft en app/globals.css).
      const fondo = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
      fondo.addColorStop(0, "#17140f");
      fondo.addColorStop(1, "#0b0b0a");
      ctx.fillStyle = fondo;
      redondearRect(ctx, 0, 0, ANCHO, ALTO, 36);
      ctx.fill();

      // Borde dorado fino, marca de la casa.
      ctx.strokeStyle = "#d8b23a";
      ctx.lineWidth = 3;
      redondearRect(ctx, 4, 4, ANCHO - 8, ALTO - 8, 32);
      ctx.stroke();

      // Logo (si se puede cargar; si no, se sigue con el nombre en texto).
      const logo = await cargarImagen("/brand/grasso-logo.png").catch(() => null);
      if (!cancelado && logo) {
        const alturaLogo = 90;
        const anchoLogo = (logo.width / logo.height) * alturaLogo;
        ctx.drawImage(logo, 56, 56, anchoLogo, alturaLogo);
      }
      if (cancelado) return;

      ctx.textBaseline = "alphabetic";

      // Etiqueta superior derecha.
      ctx.font = "300 26px Lato, sans-serif";
      ctx.fillStyle = "rgba(245, 241, 230, 0.62)";
      ctx.textAlign = "right";
      ctx.fillText("TARJETA DE FIDELIZACIÓN", ANCHO - 56, 90);

      // Nombre del cliente.
      ctx.textAlign = "left";
      ctx.font = "400 34px Lato, sans-serif";
      ctx.fillStyle = "#f5f1e6";
      ctx.fillText(nombre, 56, 260);

      // Saldo, el elemento principal de la tarjeta.
      ctx.font = "300 26px Lato, sans-serif";
      ctx.fillStyle = "rgba(245, 241, 230, 0.62)";
      ctx.fillText("SALDO DISPONIBLE", 56, 340);

      ctx.font = "700 90px Lato, sans-serif";
      ctx.fillStyle = "#f2d368";
      ctx.fillText(formatearPrecio(saldoFidelizacionCentimos), 56, 440);

      // Pie: las dos sedes.
      ctx.font = "300 24px Lato, sans-serif";
      ctx.fillStyle = "rgba(245, 241, 230, 0.5)";
      ctx.fillText("Los Molinos · Avenida de las Ciudades", 56, ALTO - 48);

      if (!cancelado) setLista(true);
    }

    dibujar();
    return () => {
      cancelado = true;
    };
  }, [nombre, saldoFidelizacionCentimos]);

  function descargar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDescargando(true);
    canvas.toBlob((blob) => {
      setDescargando(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tarjeta-barberia-grasso.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function anadirAWallet(tipo: "apple" | "google") {
    setAvisoWallet(null);
    try {
      const res = await fetch(`/api/wallet/${tipo}`);
      if (res.status === 501) {
        setAvisoWallet(
          tipo === "apple"
            ? "El Wallet real de Apple todavía no está activado — de momento, descarga la tarjeta como imagen."
            : "El Wallet real de Google todavía no está activado — de momento, descarga la tarjeta como imagen."
        );
        return;
      }
      if (!res.ok) {
        setAvisoWallet("No se ha podido generar la tarjeta para Wallet. Inténtalo de nuevo.");
        return;
      }
      if (tipo === "google") {
        const { url } = await res.json();
        if (url) window.location.href = url;
        return;
      }
      // Apple Wallet: el backend devuelve directamente el archivo .pkpass.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.location.href = url;
    } catch {
      setAvisoWallet("No se ha podido conectar con el servidor. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl shadow-2xl shadow-black/40">
        <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: `${ANCHO} / ${ALTO}` }} />
      </div>

      <button
        onClick={descargar}
        disabled={!lista || descargando}
        className="w-full rounded-full bg-brand-yellow px-4 py-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink hover:bg-brand-yellow-dark disabled:opacity-50"
      >
        {descargando ? "Preparando…" : "Descargar tarjeta (imagen)"}
      </button>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BotonWallet
          etiqueta="Añadir a Apple Wallet"
          disponible={walletAppleDisponible}
          onClick={() => anadirAWallet("apple")}
        />
        <BotonWallet
          etiqueta="Añadir a Google Wallet"
          disponible={walletGoogleDisponible}
          onClick={() => anadirAWallet("google")}
        />
      </div>

      {avisoWallet && (
        <p className="rounded-lg border border-brand-yellow/30 bg-brand-black-soft p-3 font-body text-sm text-brand-white-dim">
          {avisoWallet}
        </p>
      )}

      {(!walletAppleDisponible || !walletGoogleDisponible) && (
        <p className="font-body text-xs text-brand-white-dim">
          Próximamente podrás añadir esta tarjeta directamente a Apple Wallet o Google Wallet. Mientras tanto,
          descárgala como imagen para guardarla donde quieras.
        </p>
      )}
    </div>
  );
}

function BotonWallet({ etiqueta, disponible, onClick }: { etiqueta: string; disponible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!disponible}
      title={disponible ? undefined : "Todavía no está activado"}
      className={
        "rounded-full border px-4 py-2.5 font-body text-sm font-medium " +
        (disponible
          ? "border-brand-yellow/50 text-brand-white hover:bg-brand-yellow/10"
          : "cursor-not-allowed border-brand-line text-brand-white-dim opacity-50")
      }
    >
      {etiqueta}
    </button>
  );
}

function redondearRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

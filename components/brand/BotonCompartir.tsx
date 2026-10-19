"use client";

import { useState } from "react";
import { IconShare, IconCheck } from "@/components/ui/Icons";

// Botón para compartir la app (enlace a /reservar) con quien quiera —
// comparación con Booksy, pedido de Diego 19/10/2026: su ficha de
// negocio tiene un botón de compartir que no existía aquí. Usa la Web
// Share API nativa del móvil cuando está disponible (abre el propio
// menú de compartir de WhatsApp/Mensajes/etc.) y cae a "copiar enlace"
// en escritorio o navegadores sin soporte.
export function BotonCompartir({
  path = "/reservar",
  titulo,
  texto,
  className,
}: {
  // Ruta relativa a compartir — se resuelve a absoluta con el propio
  // origen del navegador en el momento de pulsar, así no hace falta
  // ninguna variable de entorno con la URL pública del sitio.
  path?: string;
  titulo: string;
  texto: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = typeof window !== "undefined" ? window.location.origin + path : path;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
      } catch {
        // El usuario cerró el panel de compartir sin elegir nada, o el
        // navegador lo rechazó: no es un error que haya que mostrar.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: no hay mucho más que intentar aquí.
    }
  }

  return (
    <button
      type="button"
      onClick={compartir}
      className={
        className ??
        "inline-flex items-center gap-1.5 font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
      }
    >
      {copiado ? (
        <>
          <IconCheck className="h-3.5 w-3.5" />
          Enlace copiado
        </>
      ) : (
        <>
          <IconShare className="h-3.5 w-3.5" />
          Compartir
        </>
      )}
    </button>
  );
}

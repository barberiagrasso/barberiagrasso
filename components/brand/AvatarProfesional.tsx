import type { ImgHTMLAttributes } from "react";

/**
 * Foto de perfil de un barbero, con degradación automática: si todavía no
 * ha subido la suya (foto_url null, el caso por defecto), se muestra el
 * logo de Barbería Grasso sobre fondo negro (public/brand/avatar-default.png).
 * Pedido de Diego (19/09/2026): debe aparecer en TODOS los sitios donde se
 * muestra el nombre de un barbero — Agenda, selector al reservar,
 * historial de citas, Equipo, Comisiones, Vacaciones, Lista de espera...
 * Siempre circular y recortada (object-cover), el tamaño lo decide quien
 * la usa a través de className (p. ej. "h-8 w-8").
 */
export function AvatarProfesional({
  fotoUrl,
  nombre,
  className = "h-8 w-8",
  ...props
}: { fotoUrl?: string | null; nombre: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const src = fotoUrl || "/brand/avatar-default.png";
  return (
    <img
      src={src}
      alt={nombre}
      className={"shrink-0 rounded-full border border-brand-line object-cover " + className}
      {...props}
    />
  );
}

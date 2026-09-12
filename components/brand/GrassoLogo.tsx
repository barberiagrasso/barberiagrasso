import type { ImgHTMLAttributes } from "react";

/**
 * Logotipo completo de Barbería Grasso (rótulo + navajas cruzadas).
 * Imagen original del cliente, tal cual — sin vectorizar ni redibujar.
 * Ya viene en blanco sobre transparente, pensada para fondos oscuros.
 */
export function GrassoLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/brand/grasso-logo.png" alt="Barbería Grasso" width={472} height={240} {...props} />;
}

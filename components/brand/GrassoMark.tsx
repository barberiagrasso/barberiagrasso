import type { ImgHTMLAttributes } from "react";

/**
 * Símbolo de las navajas cruzadas de Barbería Grasso, recortado del
 * logotipo original del cliente (recorte simple, sin vectorizar ni
 * redibujar) y coloreado en amarillo de marca — pensado para usos
 * pequeños (favicon, insignias, separadores).
 */
export function GrassoMark(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/brand/grasso-mark.png" alt="Barbería Grasso" width={814} height={814} {...props} />;
}

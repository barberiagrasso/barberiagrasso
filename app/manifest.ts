import type { MetadataRoute } from "next";

// Genera /manifest.webmanifest — es lo que le dice al navegador que esto
// se puede "instalar" (icono en pantalla de inicio, se abre sin barra de
// direcciones). Next.js lo enlaza solo en el <head>, no hace falta un
// <link rel="manifest"> a mano.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Barbería Grasso",
    short_name: "Grasso",
    description: "Reserva tu cita en Barbería Grasso — Los Molinos y Avenida de las Ciudades",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "es-ES",
    background_color: "#0b0b0a",
    theme_color: "#0b0b0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

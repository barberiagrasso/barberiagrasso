import type { Metadata, Viewport } from "next";
// Una sola familia (Lato) en todos sus grosores: la jerarquía visual
// (titulares / subtítulos / texto / precios y horas) se consigue con el
// peso de la letra, no cambiando de tipografía — ver globals.css.
import "@fontsource/lato/100.css";
import "@fontsource/lato/100-italic.css";
import "@fontsource/lato/300.css";
import "@fontsource/lato/300-italic.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/700-italic.css";
import "@fontsource/lato/900.css";
import "@fontsource/lato/900-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barbería Grasso",
  description: "Reserva tu cita en Barbería Grasso — Los Molinos y Avenida de las Ciudades",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-body">{children}</body>
    </html>
  );
}

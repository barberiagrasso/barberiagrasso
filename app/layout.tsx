import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barbería Grasso",
  description: "Reserva tu cita en Barbería Grasso — Los Molinos y Avenida de las Ciudades",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

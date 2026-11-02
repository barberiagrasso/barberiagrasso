import type { Metadata, Viewport } from "next";
// Sora (titulares) + Inter (cuerpo): el sistema de diseño nuevo — ver
// globals.css para qué clase de utilidad usa cada una.
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
// Lato se mantiene cargada (sin que ninguna clase de Tailwind la use ya)
// porque app/perfil/tarjeta/TarjetaClient.tsx la dibuja directamente en
// un <canvas> vía document.fonts — fuera del alcance de esta etapa.
import "@fontsource/lato/300.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "./globals.css";
import RegistrarServiceWorker from "@/components/pwa/RegistrarServiceWorker";

// Dirección pública de la app, para que la vista previa al compartir el
// enlace (WhatsApp, Instagram...) lleve la imagen con su dirección
// completa. En Vercel se usa el dominio de producción que tenga el
// proyecto (si algún día se pone un dominio propio, se coge solo).
const URL_PUBLICA = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://barberiagrasso.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(URL_PUBLICA),
  title: "Barbería Grasso",
  description: "Reserva tu cita en Barbería Grasso — Los Molinos y Avenida de las Ciudades",
  // Vista previa al compartir el enlace. La imagen es app/opengraph-image.jpg
  // (logo sobre una foto del local), que Next.js añade sola.
  openGraph: {
    title: "Barbería Grasso",
    description: "Reserva tu cita online en Los Molinos y Avenida de las Ciudades (Getafe).",
    siteName: "Barbería Grasso",
    locale: "es_ES",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  // Junto con app/manifest.ts y public/sw.js, esto es lo que permite
  // "instalar" la web como app (icono en pantalla de inicio, se abre sin
  // barra de direcciones) — ver components/pwa/InstalarApp.tsx.
  appleWebApp: {
    capable: true,
    title: "Grasso",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-body">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}

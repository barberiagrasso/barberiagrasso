// Tipografías compartidas del nuevo diseño (grasso-web.zip, pedido de Diego 08/11/2026):
// Anton para titulares, Permanent Marker para los acentos "manuscritos", Inter para el cuerpo.
//
// OJO: nueva-home.module.css ya declaraba estas tres en --display/--script/--body, pero nunca
// se cargaban de ningún sitio (el <link> a Google Fonts solo existía en el index.html estático
// del zip, que no es lo que se sirve). Así que /nueva-home lleva publicada desde el 08/11 cayendo
// en su fallback (Impact/Arial Narrow y cursiva del sistema) en vez de la tipografía real que
// Diego aprobó en las capturas. Se arregla aquí con next/font (una sola vez, se reparte a todas
// las páginas que usen este sistema de diseño) y se corrige a la vez en /nueva-home.
import { Anton, Permanent_Marker, Inter } from "next/font/google";

export const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

export const permanentMarker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-permanent-marker",
  display: "swap",
});

export const journeyInter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-journey-inter",
  display: "swap",
});

// Classes a aplicar en el contenedor raíz de cada página que use este sistema (journey.module.css
// las referencia como var(--font-anton), var(--font-permanent-marker), var(--font-journey-inter)).
export const journeyFontVars = `${anton.variable} ${permanentMarker.variable} ${journeyInter.variable}`;

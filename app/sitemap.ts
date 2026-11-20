import type { MetadataRoute } from "next";

// Mismo cálculo de dominio que app/layout.tsx y app/robots.ts.
const URL_PUBLICA = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://barberiagrasso.vercel.app";

// Genera /sitemap.xml con las páginas públicas (sin cuenta ni sesión):
// se queda fuera todo lo que requiere iniciar sesión o es privado
// (/perfil, /acceso, /admin). /nueva-home ya no es una ruta real desde
// el cutover a producción (20/11/2026): redirige a "/", que es la que
// aparece abajo.
export default function sitemap(): MetadataRoute.Sitemap {
  const paginas: { ruta: string; prioridad: number; frecuencia: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { ruta: "/", prioridad: 1, frecuencia: "weekly" },
    { ruta: "/reservar", prioridad: 0.9, frecuencia: "weekly" },
    { ruta: "/portafolio", prioridad: 0.7, frecuencia: "weekly" },
    { ruta: "/tienda", prioridad: 0.5, frecuencia: "monthly" },
    { ruta: "/politica-privacidad", prioridad: 0.1, frecuencia: "yearly" },
  ];

  return paginas.map(({ ruta, prioridad, frecuencia }) => ({
    url: `${URL_PUBLICA}${ruta}`,
    lastModified: new Date(),
    changeFrequency: frecuencia,
    priority: prioridad,
  }));
}

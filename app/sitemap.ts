import type { MetadataRoute } from "next";

// Mismo cálculo de dominio que app/layout.tsx y app/robots.ts.
const URL_PUBLICA = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://barberiagrasso.vercel.app";

// Genera /sitemap.xml con las páginas públicas (sin cuenta ni sesión):
// se queda fuera todo lo que requiere iniciar sesión o es privado
// (/perfil, /acceso, /admin) y /nueva-home, que todavía es solo una
// vista previa en esta rama (ver su propio comentario en
// app/nueva-home/page.tsx) y no sustituye a app/page.tsx.
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

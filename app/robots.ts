import type { MetadataRoute } from "next";

// Mismo cálculo de dominio que app/layout.tsx y app/sitemap.ts: en Vercel
// se usa el dominio de producción del proyecto (si algún día se pone un
// dominio propio, se coge solo).
const URL_PUBLICA = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://barberiagrasso.vercel.app";

// Genera /robots.txt. Permite rastrear las páginas públicas y bloquea el
// panel de administración y las páginas con datos personales del cliente
// (perfil, login, recuperación de contraseña) — no por seguridad (ya están
// protegidas por sesión, esto no sustituye eso), sino para que no aparezcan
// en resultados de búsqueda.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/perfil", "/acceso", "/api"],
    },
    sitemap: `${URL_PUBLICA}/sitemap.xml`,
  };
}

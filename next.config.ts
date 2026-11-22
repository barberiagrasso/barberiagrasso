import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El service worker (public/sw.js) tiene que revisarse en cada visita:
  // si algún proxy o el propio navegador lo cachea un tiempo largo, una
  // actualización suya puede tardar días en llegarle a un cliente que ya
  // tiene la app instalada. Los archivos con hash de /_next/static/ (los
  // que el propio sw.js sí cachea) no llevan este problema porque cambian
  // de nombre en cada build.
  async headers() {
    return [
      // Cabeceras de seguridad en todas las páginas (auditoría 22/11/2026):
      // nadie puede meter la app dentro de otra web para engañar a un
      // cliente (clickjacking), el navegador fuerza siempre HTTPS y no se
      // filtran direcciones internas al salir hacia otras webs.
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;

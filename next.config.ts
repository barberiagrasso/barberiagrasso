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
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;

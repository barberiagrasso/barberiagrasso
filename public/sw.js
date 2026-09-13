// Service worker mínimo, solo para poder "instalarse" como app — no está
// pensado para funcionar sin conexión de verdad, y a propósito NUNCA
// intercepta páginas ni llamadas a /api/: la disponibilidad de huecos, el
// estado de una reserva o la sesión del cliente siempre tienen que venir
// del servidor, nunca de una caché que se pueda quedar anticuada.
//
// Solo cachea los archivos estáticos con hash de Next.js dentro de
// /_next/static/ (son inmutables: cada build genera nombres nuevos), así
// que cachearlos "para siempre" es siempre seguro.
//
// Si alguna vez cambias esta lógica, sube CACHE_NAME para que los
// móviles que ya tengan la app instalada empiecen una caché limpia.
const CACHE_NAME = "grasso-estatico-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca tocar reservas, cancelaciones, etc.

  const url = new URL(request.url);
  const esAssetEstaticoDeNext = url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
  if (!esAssetEstaticoDeNext) return; // deja pasar todo lo demás sin intervenir

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const enCache = await cache.match(request);
      if (enCache) return enCache;
      const respuesta = await fetch(request);
      if (respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
  );
});

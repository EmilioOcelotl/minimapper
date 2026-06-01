// Service Worker de MiniMapper — caché offline.
//
// Una vez instalado (la primera vez que alguien abre la página con conexión),
// MiniMapper sigue funcionando sin internet. Estrategia: stale-while-revalidate
// — se responde de inmediato desde el caché y, si hay red, se actualiza en
// segundo plano para la próxima visita.
//
// IMPORTANTE: un Service Worker solo funciona servido por https:// o
// http://localhost. No se registra (ni hace falta) abriendo index.html con
// file://. El registro vive en index.html.
//
// Para forzar que todos reciban una versión nueva de los archivos, sube
// CACHE_VERSION. El activate borra los cachés viejos.

const CACHE_VERSION = 'minimapper-v1';

// Archivos locales que se precachean al instalar. Rutas relativas para que
// funcione tanto en la raíz como en un subdirectorio (GitHub Pages: /minimapper/).
const APP_SHELL = [
  './',
  './index.html',
  './sketch.js',
  './styles.css',
  './assets/img/minimapperBanner.png',
  './assets/img/minimapperCaptura.png',
];

// Dependencias de CDN. Se intentan precachear, pero si fallan (CDN caído,
// redirección, etc.) no se aborta la instalación: el fetch handler las
// cachea en runtime la primera vez que se piden.
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.6.0/p5.min.js',
  'https://unpkg.com/hydra-synth',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // El app shell es obligatorio: si algo aquí falla, la instalación falla.
    await cache.addAll(APP_SHELL);
    // El CDN es best-effort: cada uno por separado, sin tumbar el install.
    await Promise.allSettled(
      CDN_ASSETS.map((url) =>
        fetch(url, { mode: 'cors' }).then((res) => {
          if (res && res.ok) return cache.put(url, res);
        }).catch(() => {})
      )
    );
    // Activa esta versión sin esperar a que se cierren las pestañas viejas.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borra cachés de versiones anteriores.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET. POST y demás van directo a la red.
  if (req.method !== 'GET') return;

  // Solo http(s). Ignora extensiones del navegador, blob:, data:, etc.
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);

    // En segundo plano: pide a la red y actualiza el caché si hay éxito.
    const networkFetch = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    // Si hay copia en caché, respóndela ya (y deja correr la actualización).
    if (cached) {
      event.waitUntil(networkFetch);
      return cached;
    }

    // Sin caché: espera la red.
    const networkRes = await networkFetch;
    if (networkRes) return networkRes;

    // Sin red y sin caché: si es una navegación, sirve el index cacheado.
    if (req.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  })());
});

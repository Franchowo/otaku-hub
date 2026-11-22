// Service Worker de OTAKU HUB.
// - Archivos de la app: red primero, pero si la red tarda más de 3 s se
//   sirve la copia guardada (la app abre rápido con mala cobertura y
//   funciona sin conexión). La copia se actualiza en cada visita.
// - Portadas de AniList, fuentes y html2canvas: caché primero (no cambian),
//   en cachés que se conservan entre versiones de la app.
// - Google Sheets (Apps Script) y la API de AniList NUNCA se cachean aquí:
//   pueden llevar tu clave. La copia de tus datos la gestiona la app en
//   IndexedDB (js/services/local-store.js).
// Si añades un archivo a la app, inclúyelo en APP_SHELL y sube CACHE_NAME.
const CACHE_NAME = 'otaku-hub-v11';
const COVERS_CACHE = 'otaku-hub-covers';
const RUNTIME_CACHE = 'otaku-hub-runtime';
const MAX_COVERS = 800;
const NETWORK_TIMEOUT_MS = 3000;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/auth.css',
  './js/config.js',
  './js/core/utils.js',
  './js/core/ui.js',
  './js/core/search.js',
  './js/core/sortable.js',
  './js/core/charts.js',
  './js/core/auth.js',
  './js/core/state.js',
  './js/services/anilist.js',
  './js/services/image-queue.js',
  './js/services/local-store.js',
  './js/services/sheets-api.js',
  './js/services/anilist-link.js',
  './js/services/anime-meta.js',
  './js/services/cloud-sync.js',
  './js/core/router.js',
  './js/services/sheets-fetchers.js',
  './js/views/forms.js',
  './js/views/stats.js',
  './js/views/studios.js',
  './js/views/recommendations.js',
  './js/views/calificador.js',
  './js/views/planificador.js',
  './js/views/ranker.js',
  './js/views/gacha.js',
  './js/views/work-sheet.js',
  './js/views/insights.js',
  './js/views/wrapped.js',
  './js/core/pwa.js',
  './js/core/fullscreen.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png'
];

const KEEP_CACHES = [CACHE_NAME, COVERS_CACHE, RUNTIME_CACHE];
const COVER_HOSTS = ['s4.anilist.co', 'img.anili.st'];
const RUNTIME_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(name => !KEEP_CACHES.includes(name)).map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstWithTimeout(req));
  } else if (COVER_HOSTS.includes(url.hostname) && !url.searchParams.has('nocache')) {
    event.respondWith(cacheFirst(req, COVERS_CACHE, MAX_COVERS));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
  }
  // Todo lo demás (Sheets, API de AniList…) va directo a la red.
});

function networkFirstWithTimeout(req) {
  return caches.open(CACHE_NAME).then(cache => new Promise(resolve => {
    let settled = false;
    // Solo las navegaciones pueden caer en index.html (la app es de una página).
    const fromCache = () => cache.match(req, { ignoreSearch: req.mode === 'navigate' })
      .then(hit => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));

    const timer = setTimeout(() => {
      fromCache().then(hit => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, NETWORK_TIMEOUT_MS);

    fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      clearTimeout(timer);
      if (!settled) { settled = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(hit => {
        if (!settled) { settled = true; resolve(hit || Response.error()); }
      });
    });
  }));
}

function cacheFirst(req, cacheName, maxEntries) {
  return caches.open(cacheName).then(cache => cache.match(req).then(hit => {
    if (hit) return hit;
    // Las portadas de AniList admiten CORS: se piden en modo cors para que la
    // respuesta no sea "opaca" (las opacas ocupan muchísimo en la cuota).
    const corsReq = new Request(req.url, { mode: 'cors', credentials: 'omit' });
    return fetch(corsReq).then(res => {
      if (res.ok) {
        cache.put(req, res.clone()).then(() => { if (maxEntries) trimCache(cache, maxEntries); });
      }
      return res;
    }).catch(() => fetch(req));
  }));
}

function trimCache(cache, maxEntries) {
  cache.keys().then(keys => {
    if (keys.length > maxEntries) {
      // Borra las más antiguas (Cache API conserva el orden de inserción).
      Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
    }
  });
}

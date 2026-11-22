// Service Worker de OTAKU HUB.
// Estrategia: "red primero" para los archivos propios (siempre ves la última
// versión) y caché como respaldo sin conexión. Las peticiones a Google Sheets,
// AniList, etc. NUNCA se cachean (pueden contener tu clave y datos privados).
const CACHE_NAME = 'otaku-hub-v7';
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
  './js/core/auth.js',
  './js/core/state.js',
  './js/services/anilist.js',
  './js/services/image-queue.js',
  './js/services/sheets-api.js',
  './js/services/anilist-link.js',
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
  './js/core/pwa.js',
  './js/core/fullscreen.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Solo GET del mismo origen; todo lo demás va directo a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

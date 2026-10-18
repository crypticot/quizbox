// Quizbox service worker: lets the app open and run without internet.
// Change VERSION every time you publish a new index.html so users get the update.
const VERSION = 'quizbox-v1';
const FONT_CACHE = 'quizbox-fonts';

// Files saved on the first visit. Missing files are skipped, not fatal.
const CORE_FILES = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon.svg',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.allSettled(CORE_FILES.map(function (file) { return cache.add(file); }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== VERSION && name !== FONT_CACHE; })
          .map(function (name) { return caches.delete(name); })
      );
    })
  );
});

// The page asks for the new version to take over when the user taps Reload.
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // The page itself: try the network first so updates arrive, fall back to the saved copy.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  // Our own files: show the saved copy straight away and refresh it in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, VERSION));
    return;
  }

  // Google Fonts: saved after the first online visit.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(VERSION);

  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch (error) {
    const saved = (await cache.match('./index.html')) || (await cache.match('./'));
    return saved || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);

  const refresh = fetch(request)
    .then(function (response) {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })
    .catch(function () { return null; });

  if (saved) return saved;

  const fresh = await refresh;
  return fresh || Response.error();
}

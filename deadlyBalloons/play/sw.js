// Deadly Balloons 3 service worker: play offline after the first visit.
// The build (vite.config.ts) fills in PRECACHE with every emitted file and
// VERSION with a hash of them, so each deploy gets a fresh cache and the old
// one is deleted on activate.
// Pages are network-first (so updates arrive); hashed assets are cache-first
// (their names change with their content); other files (icons, manifest) are
// served from the cache and refreshed in the background.
const VERSION = "dadc4acf1466";
const PRECACHE = ["./","./assets/index-_iLclLsj.js","./assets/CanvasPool-D2tzPPke.js","./assets/RenderTargetSystem-BEtPb9va.js","./assets/browserAll-DKIQK-Yo.js","./assets/canvasUtils-BAiQ06yU.js","./assets/getTexelRangeRects-rxQ59kRK.js","./assets/getTextureBatchBindGroup-C473t026.js","./assets/init-DPhg8wyW.js","./assets/panel-BGKERwKj.js","./assets/webworkerAll-DwAs5GIz.js","./assets/index-QslNTE0_.css","./icons/apple-touch-icon.png","./icons/favicon-64.png","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./manifest.webmanifest"];
const CACHE = `db3-${VERSION}`;
const START = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('db3-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only the start page is kept, and never an error page.
          if (res.ok && (url.href === START || url.href === `${START}index.html`)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  const hashed = url.pathname.includes('/assets/');
  event.respondWith(
    // ignoreVary: static files don't vary per request, but some hosts send `Vary: Origin`, and module
    // scripts carry an Origin header the precache requests lacked, so they would never match.
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const fresh = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
      if (hit) {
        if (!hashed) event.waitUntil(fresh.catch(() => undefined));
        return hit;
      }
      return fresh;
    }),
  );
});

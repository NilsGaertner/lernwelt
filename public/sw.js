// Service Worker: macht die Lernwelt auf Android/Chrome als App installierbar.
// Die Seiten kommen immer frisch vom Server (neue Versionen sind sofort da);
// der Cache springt nur ein, wenn der Server kurz nicht erreichbar ist.
// /api wird nie zwischengespeichert, Sterne und Fortschritt kommen immer live.

const CACHE = 'lernwelt-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () =>
        (await caches.match(req)) || (req.mode === 'navigate' && (await caches.match('/'))) || Response.error()
      )
  );
});

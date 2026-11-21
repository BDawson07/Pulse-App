// Pulse service worker: offline app shell + cached map library and recently viewed map tiles.
const VERSION = 'pulse-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
const TILE_CACHE = 'pulse-tiles', TILE_MAX = 400;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    try { await c.add(new Request(LIB, { mode: 'cors' })); } catch (err) { /* offline at install: cached later */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== TILE_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimTiles() {
  const c = await caches.open(TILE_CACHE), keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app page: network first so updates you push to GitHub show up; cached copy when offline.
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('/index.html'))) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) (await caches.open(VERSION)).put('./index.html', res.clone());
        return res;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Map tiles: network first, fall back to recently viewed tiles offline.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); } return res; }
      catch (err) { return (await c.match(req)) || Response.error(); }
    })());
    return;
  }

  // Everything else from our site or the Leaflet CDN: cache first.
  if (url.origin === location.origin || url.href === LIB) {
    e.respondWith((async () => {
      const hit = await caches.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
  }
});

// GeoMoz Explorer 3D — Production Progressive Web App (PWA) Service Worker
const CACHE_VERSION = "geomoz-v1.0.1";
const CACHE_SHELL = `geomoz-shell-${CACHE_VERSION}`;
const CACHE_STATIC = `geomoz-static-${CACHE_VERSION}`;
const CACHE_TILES = `geomoz-tiles-${CACHE_VERSION}`;
const CACHE_DATA = `geomoz-data-${CACHE_VERSION}`;

const MAX_TILES = 600;

// Core shell assets to precache immediately on install
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/manifest.json",
  "/favicon.svg",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

// 1. Install: Precache shell & immediately activate
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[GeoMoz SW] Precache error (non-fatal):", err);
        return self.skipWaiting();
      }),
  );
});

// 2. Activate: Clean up old caches & take control of clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (
              key.startsWith("geomoz-") &&
              key !== CACHE_SHELL &&
              key !== CACHE_STATIC &&
              key !== CACHE_TILES &&
              key !== CACHE_DATA
            ) {
              console.log("[GeoMoz SW] Cleaning up outdated cache:", key);
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Helper: Trim tile cache to keep storage reasonable
async function trimTileCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map((req) => cache.delete(req)));
  }
}

// 3. Fetch: Contextual caching strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests and browser extensions
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // A. Navigation Requests (HTML Pages): Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_SHELL).then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("/")) ||
            (await caches.match("/index.html"));
          if (cached) return cached;
          return new Response(
            `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>GeoMoz Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#020617;color:#f8fafc;text-align:center;padding:20px;"><div><h1 style="color:#38bdf8;">GeoMoz Explorer 3D</h1><p>Está atualmente offline. As análises guardadas em cache continuam disponíveis.</p><button onclick="location.reload()" style="background:#0284c7;color:#fff;border:none;padding:10px 20px;border-radius:12px;cursor:pointer;font-weight:bold;">Tentar Novamente</button></div></body></html>`,
            { headers: { "Content-Type": "text/html" } },
          );
        }),
    );
    return;
  }

  // B. Map Tiles: Cache-First with fallback to network & background cache
  const isMapTile =
    url.hostname.includes("cartocdn.com") ||
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("tiles.maps.eox.at") ||
    url.hostname.includes("google.com") && url.pathname.includes("/vt/lyrs");

  if (isMapTile) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_TILES).then((cache) => {
                cache.put(request, clone);
                trimTileCache(CACHE_TILES, MAX_TILES);
              });
            }
            return response;
          })
          .catch(() => cached);
      }),
    );
    return;
  }

  // C. Share & Analysis API: Network-first with cache fallback
  if (url.pathname.includes("/geomoz-api/share") || url.pathname.includes("/geomoz-api/analyses")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_DATA).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // D. Static Assets (JS, CSS, Fonts, Images): Stale-While-Revalidate
  const isStatic =
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com");

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_STATIC).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // E. Default fetch
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// 4. Message: Skip Waiting on demand for instant updates
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

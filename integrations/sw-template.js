// Prunest offline support. Generated at build time from integrations/sw-template.js.
// Keeps only Prunest's own pages and files. Nothing you type into a calculator
// is stored here; that stays in the page (and in local storage if you save).
const VERSION = '__VERSION__';
const CACHE = `prunest-${VERSION}`;
const PRECACHE = __PRECACHE__;
const NOT_FOUND = '/404';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          // The not-found page may be served with a 404 status; keep it anyway.
          if (!response.ok && url !== NOT_FOUND) throw new Error(`Could not save ${url}`);
          await cache.put(url, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('prunest-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Pages: try the network first so updates show up, fall back to the saved copy. */
async function page(request) {
  const url = new URL(request.url);
  const key = url.pathname.replace(/\.html$/, '').replace(/(.)\/$/, '$1');
  const cache = await caches.open(CACHE);
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000));
    const response = await Promise.race([fetch(request), timeout]);
    if (response.ok && PRECACHE.includes(key)) cache.put(key, response.clone());
    return response;
  } catch {
    return (await cache.match(key)) || (await cache.match(NOT_FOUND)) || Response.error();
  }
}

/** Built files have content hashes in their names, so the saved copy is always right. */
async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).pathname.startsWith('/_astro/')) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only Prunest's own files. Ads, analytics and anything else go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else event.respondWith(asset(request));
});

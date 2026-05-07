const CACHE_NAME = 'pedrad-v3';
const APP_BASE   = new URL('./', self.location.href).href;

const PRECACHE = [
  '.', 'index.html', 'home.html', 'store.html', 'checkout.html',
  'orders.html', 'profile.html', 'notifications.html', 'address.html',
  'client.css', 'index.css', 'page-transition.js', 'pwa-register.js',
  'swipe-back.js', 'safe-area.js',
  'manifest.json', 'icon-192.png'
].map(p => new URL(p, APP_BASE).href);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Requisições externas (Firebase, CDN, etc.) — sempre rede
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHtml   = e.request.destination === 'document' || path.endsWith('.html') || path === '/';
  const isStatic = /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)$/.test(path);

  if (isStatic) {
    // Cache-first: assets estáticos servem do cache instantaneamente
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  if (isHtml) {
    // Stale-while-revalidate: entrega do cache imediatamente, atualiza em background
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || fresh; // se tiver cache, serve já; fresh atualiza em bg
        })
      )
    );
    return;
  }

  // Demais recursos: rede primeiro, cache como fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

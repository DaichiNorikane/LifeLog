const CACHE_NAME = 'lifelog-v1';
const STATIC_CACHE = 'lifelog-static-v1';
const IMAGE_CACHE = 'lifelog-images-v1';

// Static assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

// Install: precache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== IMAGE_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, etc.
  if (!url.protocol.startsWith('http')) return;

  // Strategy 1: Cache First for images (Elena expressions, icons)
  if (
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/icon') ||
    url.pathname.startsWith('/apple-icon') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.jpg')
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Strategy 2: Cache First for static assets (JS, CSS, fonts)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategy 3: Network First for API routes
  if (url.pathname.startsWith('/api/')) {
    return; // Let API calls go through normally
  }

  // Strategy 4: Stale-While-Revalidate for pages
  event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
});

// Cache First: use cache, fallback to network
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

// Stale-While-Revalidate: return cache immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// --- Push Notification ---

self.addEventListener('push', (event) => {
  let data = { title: 'LifeLog', body: 'エレナからのお知らせ' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.tag || 'lifelog-notification',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click: open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

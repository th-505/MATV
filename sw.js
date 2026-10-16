'use strict';

const CACHE_NAME = 'ma-tv-web-v1.0.46';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      } catch (err) {
        console.warn('Old cache cleanup error:', err);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Network first with cache fallback
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(event.request);
      if (match) return match;
      throw new Error('Offline and not cached');
    })
  );
});

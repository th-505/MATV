'use strict';

const CACHE_NAME = 'mitv-web-v1.0.44';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Purge all existing caches
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      } catch (e) {
        console.warn('Cache purge failed:', e);
      }

      // 2. Unregister any stale service workers
      try {
        await self.registration.unregister();
      } catch (e) {
        console.warn('Failed to unregister service worker:', e);
      }

      // 3. Claim clients and navigate to break old cache
      try {
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url);
          }
        });
      } catch (e) {
        console.warn('Failed to refresh clients:', e);
      }
    })()
  );
});

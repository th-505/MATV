// Retire the former public browser deployment without touching other app data.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  await self.clients.claim();
  const pages=await self.clients.matchAll({type:'window'});
  await self.registration.unregister();
  for(const page of pages)await page.navigate('https://matv.onrender.com/internal/');
})()));

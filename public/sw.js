const CACHE = 'dealwise-v1';
const STATIC = ['/','style.css','app.js','manifest.json','favicon.svg'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
);

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
);

self.addEventListener('fetch', e => {
  // Never cache API calls — always fresh
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

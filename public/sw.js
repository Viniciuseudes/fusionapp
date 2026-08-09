const CACHE_NAME = 'fusion-pwa-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Força o SW a atualizar imediatamente
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/']))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim()); // Assume o controle da página imediatamente
});

self.addEventListener('fetch', (e) => {
  // Estratégia "Network First": Tenta a internet, se falhar (offline), usa o cache
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
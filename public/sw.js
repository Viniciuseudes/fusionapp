const CACHE_NAME = 'fusion-pwa-v2';

// ==========================================
// 1. LÓGICA DE CACHE E INSTALAÇÃO PWA
// ==========================================

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

// ==========================================
// 2. LÓGICA DE PUSH NOTIFICATIONS
// ==========================================

// Ouve o evento de Push vindo do Google/Apple
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png', // Ícone pequeno para a barra de status do Android
      vibrate: [200, 100, 200], // Padrão de vibração
      data: {
        url: data.url || '/' // Pra onde ir quando clicar
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Ouve o clique na notificação
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // Se já tiver uma aba aberta, foca nela
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não, abre uma nova aba
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
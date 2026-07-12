// Service worker: app-shell offline. Sube CACHE al desplegar cambios.
const CACHE = 'quizmaster-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/model.js', './js/quiz.js', './js/ui.js', './js/views.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  'https://cdn.tailwindcss.com',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Navegación → network-first (para recibir actualizaciones), resto → stale-while-revalidate.
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(request).then(hit => {
      const net = fetch(request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

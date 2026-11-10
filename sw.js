/* Nova Dashboard offline support: keeps the app files on the phone so it opens without signal.
   Your records are synced separately by Firebase; this file never touches them. */
const CACHE = 'nova-dashboard-v4.0';
const SHELL = ['./', 'index.html', 'app.js', 'cloud.js', 'xlsx.js', 'photos.js', 'firebase-config.js', 'manifest.webmanifest',
  'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-192.png', 'img/icon-maskable-512.png', 'img/favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = u.origin === location.origin;
  const sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  const fonts = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (!(sameOrigin || sdk || fonts)) return;            // Firebase data, sign-in and rates go straight to the network
  if (sameOrigin) {                                       // app files: newest when online, saved copy when offline
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else {                                                // SDK + fonts: versioned, cache first
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const cp = n.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return n; })));
  }
});

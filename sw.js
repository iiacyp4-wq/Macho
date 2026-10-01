// 오프라인에서도 열리도록 파일을 저장해 두는 서비스워커
const CACHE = 'macho-v19';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'foods.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'scriptable/Macho.js', 'scriptable/MachoBar.js', 'fooddb.json', 'vendor/zxing.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// 인터넷이 되면 항상 최신 파일, 안 되면 저장본 (3초 넘게 걸려도 저장본)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const net = fetch(e.request, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; });
    const cached = await c.match(e.request, { ignoreSearch: true });
    if (!cached) return net;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
    return Promise.race([net.catch(() => cached), timeout]);
  }));
});

// 알림을 누르면 앱 열기
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const w = list.find((c) => 'focus' in c);
    return w ? w.focus() : self.clients.openWindow('./');
  }));
});

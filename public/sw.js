// オフラインでも画面を開けるようにする Service Worker。
//
// - ページ: ネットワーク優先。オフラインのときだけ最後に開いたものを出す
//   （キャッシュ優先にすると、新しい版を出しても古い画面が出続ける）
// - /_next/static: ファイル名にハッシュが入っていて中身が変わらないので、キャッシュ優先
// - /api: キャッシュしない。本人のデータを端末に残さないため（サインアウト後も残ってしまう）。
//   オフラインの練習記録は、画面側で localStorage に溜めて後で送る
const CACHE_NAME = 'shadowing-v2';
const PRECACHE_URLS = ['/', '/today', '/reader', '/youtube', '/library'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 古い版のキャッシュ（API の応答を含む）を消す
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
  }
});

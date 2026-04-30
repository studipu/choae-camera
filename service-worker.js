/* 최애 카메라 — Service Worker
 * 첫 방문 시 정적 리소스를 캐시 → 이후 오프라인에서도 동작
 */

const CACHE_NAME = 'choae-camera-v6';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './characters/Gemini_Generated_Image_50ez6t50ez6t50ez.png',
  './characters/Gemini_Generated_Image_9oheph9oheph9ohe.png',
  './characters/Gemini_Generated_Image_cfnus1cfnus1cfnu.png',
  './characters/Gemini_Generated_Image_naaz53naaz53naaz.png',
  './characters/Gemini_Generated_Image_pj4z23pj4z23pj4z.png',
];

// 설치: 정적 자산 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 페치: 캐시 우선, 실패 시 네트워크
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET 요청만 처리 (카메라 스트림 등은 패스)
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // 같은 출처의 정상 응답이면 런타임 캐시에도 추가
        if (res && res.status === 200 && new URL(req.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // 오프라인이면 index 폴백
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

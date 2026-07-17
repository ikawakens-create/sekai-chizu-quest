/* せかいちずクエスト SW
   コアはprecache。app.js/index.html/ナビゲーションはnetwork-first（オフライン時のみキャッシュ）、
   国旗画像などの静的アセットはアクセス時にキャッシュ（cache-first） */
const CACHE = "sekai-quest-v2";
const CORE = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const NETWORK_FIRST_PATHS = ["/app.js", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNetworkFirst(request) {
  if (request.mode === "navigate") return true;
  const path = new URL(request.url).pathname;
  return NETWORK_FIRST_PATHS.some((p) => path.endsWith(p));
}

function networkFirst(request) {
  return fetch(request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
    return res;
  }).catch(() => caches.match(request));
}

function cacheFirst(request) {
  return caches.match(request).then((hit) => hit || fetch(request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
    return res;
  }).catch(() => hit));
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(isNetworkFirst(e.request) ? networkFirst(e.request) : cacheFirst(e.request));
});

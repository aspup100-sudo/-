// 오프라인에서도 열리게 하는 서비스 워커. 온라인이면 항상 최신 파일을 받고, 끊기면 저장해 둔 파일을 써요.
const CACHE = "changsin-v20";
const SHELL = ["./", "./index.html", "./pick.html", "./styles.css", "./data.js", "./data-guui.js", "./areas.js", "./listings.js", "./updated.js", "./asks.js", "./auth.js", "./boot.js", "./data/gu/index.json", "./app.js", "./reviews.js", "./map.js", "./route.js", "./sync.js", "./config.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    // no-cache: 브라우저가 예전 파일을 붙들고 있지 않게, 매번 서버에 새 버전이 있는지 물어봐요.
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match("./index.html")))
  );
});

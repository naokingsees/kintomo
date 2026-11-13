/* =========================================================
   きんトモ — オフライン対応(サービスワーカー)
   一度開けば、電波のないジムでも動くようにします。
   アプリを更新したら VERSION の数字を上げてください。
   ========================================================= */
const VERSION = 'v1';
const SHELL = `kintomo-shell-${VERSION}`;
const FONTS = 'kintomo-fonts';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kintomo-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 文字(Google Fonts):一度取れたら保存して使い回す
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }
  if (url.origin !== location.origin) return;

  // 画面:まずネットから最新を取り、だめなら保存してあるものを出す
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // そのほかのファイル:保存してあるものをすぐ出し、裏で新しいものに入れかえる
  e.respondWith(
    caches.open(SHELL).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    }))
  );
});

// Service worker: caches the app shell so Oval Farms ERP opens instantly and works offline.
// Business data is not cached here; it lives in Firebase, which keeps its own copy on each device.
const VERSION = "oval-erp-v2.0.6";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./config.js", "./css/app.css",
  "./assets/logo.png", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-maskable-512.png", "./assets/apple-touch-icon.png", "./assets/favicon-64.png",
  "./js/app.js", "./js/calc.js", "./js/catalog.js", "./js/firebase.js", "./js/google.js", "./js/icons.js", "./js/idb.js", "./js/packs.js", "./js/router.js", "./js/schema.js",
  "./js/seed.js", "./js/seed-products.js", "./js/session.js", "./js/store.js", "./js/ui.js", "./js/util.js",
  "./js/views/attendance.js", "./js/views/charts.js", "./js/views/crud.js", "./js/views/customers.js", "./js/views/dashboard.js", "./js/views/docs.js", "./js/views/orders.js", "./js/views/products.js",
  "./js/views/production.js", "./js/views/reports.js", "./js/views/settings.js", "./js/views/stock.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Google sign-in, Firebase and fonts always go to the network.
  if (url.origin !== self.location.origin) return;
  // Network first (so updates show up straight away), cache as the offline fallback.
  event.respondWith(
    fetch(req).then((resp) => {
      if (resp && resp.ok) { const copy = resp.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
  );
});

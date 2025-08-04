const CACHE_NAME = "lichhoc-cache-v1";

// ⚠️ Thêm đầy đủ các file cần để hoạt động offline
const urlsToCache = [
  "/", // root
  "index.html",
  "/lichcanhan.html",
  "/main.js",
  "/style.css",
  "/site.webmanifest",
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-96x96.png",
  "/apple-touch-icon.png",
  "/utils/card.js",
  "/utils/date.js",
  "/utils/period.js",
  "/utils/timetable.js",
  "/utils/transform.js",
  "/lichcanhan",
];

// 🌀 Cài đặt service worker & cache file
self.addEventListener("install", (event) => {
  console.log("🔧 Installing Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("✅ Caching app shell");
      return cache.addAll(urlsToCache);
    })
  );
});

// 🔁 Kích hoạt và dọn cache cũ nếu có
self.addEventListener("activate", (event) => {
  console.log("⚙️ Activating Service Worker...");
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🧹 Deleting old cache:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// ⚡ Intercept mọi request và dùng cache nếu offline
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;

      return fetch(event.request).catch(() => {
        // Nếu là request điều hướng trang (HTML), hiển thị thông báo đơn giản
        if (event.request.mode === "navigate") {
          return new Response(
            `<h2 style="color:red;text-align:center;padding:20px">
              Bạn đang offline và trang này không được cache sẵn.
            </h2>`,
            { headers: { "Content-Type": "text/html" } }
          );
        }

        // Với request khác (ảnh, js, css...) trả lỗi đơn giản
        return new Response("Tài nguyên không khả dụng khi offline.", {
          status: 503,
          statusText: "Offline",
        });
      });
    })
  );
});

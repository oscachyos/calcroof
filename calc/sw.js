const SCOPE = new URL('./', self.location);
const cacheUrl = (rel) => new URL(rel, SCOPE).href;

const CACHE_NAME = 'technonicol-calc-v4';
const urlsToCache = [
  SCOPE.href,
  cacheUrl('index.html'),
  cacheUrl('styles.css'),
  cacheUrl('script.js'),
  cacheUrl('settings.js'),
  cacheUrl('logo.png'),
  /* json/workers.json не прекэшируем: пустой/404 при первой установке SW ломал бы список в кэше */
  cacheUrl('json/manifest.json')
];

// Установка service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Открыт кэш');
        return cache.addAll(urlsToCache);
      })
  );
});

// Активация service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Удаляем старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const reqUrl = event.request.url;
  const isWorkersJson = /\/json\/workers\.json(\?|$)/i.test(reqUrl);

  event.respondWith(
    (isWorkersJson
      ? fetch(event.request)
          .then((net) => {
            if (net && net.ok && net.status === 200) return net;
            return caches.match(event.request).then((cached) => cached || net);
          })
      : caches.match(event.request)
          .then((response) => {
            if (response) return response;
            return fetch(event.request);
          })
    )
      .then((response) => {
        if (!response) return response;
        if (isWorkersJson) return response;
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => caches.match(cacheUrl('index.html')))
  );
});

const SCOPE = new URL('./', self.location);
const cacheUrl = (rel) => new URL(rel, SCOPE).href;

const CACHE_NAME = 'technonicol-calc-v3';
const urlsToCache = [
  SCOPE.href,
  cacheUrl('index.html'),
  cacheUrl('styles.css'),
  cacheUrl('script.js'),
  cacheUrl('settings.js'),
  cacheUrl('logo.png'),
  cacheUrl('json/workers.json'),
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
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кэшированный ответ, если есть
        if (response) {
          return response;
        }
        
        // Иначе делаем запрос к сети
        return fetch(event.request).then(
          (response) => {
            // Проверяем, что ответ валиден
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Клонируем ответ для кэша
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          }
        );
      })
      .catch(() => {
        // Если оффлайн и нет в кэше, можно вернуть fallback страницу
        return caches.match(cacheUrl('index.html'));
      })
  );
});

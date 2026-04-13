// Service Worker 文件 (sw.js) - 强力保活版

// 缓存版本号
const CACHE_VERSION = 'v1.7.41';
const CACHE_NAME = `ephone-cache-${CACHE_VERSION}`;

const URLS_TO_CACHE = [
  './index.html',
  './style.css',
  './google-api-shim.js',
  './script.js',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://phoebeboo.github.io/mewoooo/pp.js',
  'https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js',
  'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
  'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756312261242_qdqqd_g0eriz.jpeg'
];

const SCRIPT_TAG = '<script src="script.js" defer="defer"></script>';
const SHIM_TAG = '<script src="google-api-shim.js" defer></script>';

async function servePatchedDocument(request) {
  const response = await fetch(request);

  if (!response.ok) {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = await response.text();
  if (html.includes(SHIM_TAG)) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  let patchedHtml = html.replace(SCRIPT_TAG, `${SHIM_TAG}\n  ${SCRIPT_TAG}`);
  if (patchedHtml === html) {
    patchedHtml = html.replace('</head>', `  ${SHIM_TAG}\n</head>`);
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');

  return new Response(patchedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function shouldPatchDocument(request) {
  if (request.method !== 'GET') {
    return false;
  }

  if (request.mode === 'navigate') {
    return true;
  }

  const url = new URL(request.url);
  return url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/niu330/');
}

// --- 强力保活核心代码 Start ---
setInterval(() => {
}, 20000);
// --- 强力保活核心代码 End ---

self.addEventListener('install', event => {
  console.log('Service Worker 正在安装 (保活增强版)...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('缓存核心文件...');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker 正在激活...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker 准备就绪，开始接管页面！');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/_keep_alive_ping_')) {
    event.respondWith(new Response('pong'));
    return;
  }

  if (shouldPatchDocument(event.request)) {
    event.respondWith(
      servePatchedDocument(event.request).catch(error => {
        console.warn('SW: 页面注入 Google shim 失败，回退原始文档。', error);
        return fetch(event.request);
      })
    );
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'ping') {
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});
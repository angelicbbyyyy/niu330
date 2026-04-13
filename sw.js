// Service Worker 文件 (sw.js) - 强力保活版

// 缓存版本号
const CACHE_VERSION = 'v1.7.33'; // 版本号+1
const CACHE_NAME = `ephone-cache-${CACHE_VERSION}`;

const URLS_TO_CACHE = [
  './index.html',
  './style.css',
  './script.js',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://phoebeboo.github.io/mewoooo/pp.js',
  'https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js',
  'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
  'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756312261242_qdqqd_g0eriz.jpeg'
];

function isGoogleAiStudioRequest(url) {
  return url.hostname === 'generativelanguage.googleapis.com';
}

function isGoogleAiStudioOpenAIPath(url) {
  return url.pathname === '/v1beta/openai/chat/completions';
}

function isGoogleAiStudioNativePath(url) {
  return url.pathname.includes(':generateContent') || url.pathname.includes(':streamGenerateContent');
}

function isOpenAICompatibleBody(body) {
  return Boolean(body) && Array.isArray(body.messages);
}

function isGeminiNativeBody(body) {
  return Boolean(body) && Array.isArray(body.contents);
}

function buildGoogleAiStudioHeaders(requestHeaders, apiKey) {
  const headers = new Headers(requestHeaders);
  if (!headers.has('Authorization') && apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function buildGoogleAiStudioTarget(url, body, apiKey) {
  if (isOpenAICompatibleBody(body)) {
    const target = new URL('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    if (apiKey) {
      target.searchParams.set('key', apiKey);
    }
    return target;
  }

  if (isGeminiNativeBody(body) && typeof body.model === 'string' && body.model.trim()) {
    const modelName = body.model.replace(/^models\//, '').trim();
    const target = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`);
    if (apiKey) {
      target.searchParams.set('key', apiKey);
    }
    return target;
  }

  return null;
}

async function normalizeGoogleAiStudioRequest(request) {
  const url = new URL(request.url);
  if (!isGoogleAiStudioRequest(url) || isGoogleAiStudioOpenAIPath(url) || isGoogleAiStudioNativePath(url)) {
    return fetch(request);
  }

  let bodyText = '';
  try {
    bodyText = await request.clone().text();
  } catch (error) {
    console.warn('SW: 无法读取 Google AI Studio 请求体，保持原请求。', error);
    return fetch(request);
  }

  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch (error) {
    return fetch(request);
  }

  const apiKey = url.searchParams.get('key');
  const normalizedUrl = buildGoogleAiStudioTarget(url, body, apiKey);
  if (!normalizedUrl) {
    return fetch(request);
  }

  const headers = buildGoogleAiStudioHeaders(request.headers, apiKey);
  console.log('SW: 已将 Google AI Studio 请求规范化。', url.pathname, '->', normalizedUrl.pathname);

  try {
    return await fetch(normalizedUrl.toString(), {
      method: request.method,
      headers,
      body: bodyText
    });
  } catch (error) {
    console.warn('SW: Google AI Studio 请求规范化失败，回退原请求。', error);
    return fetch(request);
  }
}

setInterval(() => {
}, 20000);

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

  if (event.request.method !== 'GET') {
    if (event.request.method === 'POST' && isGoogleAiStudioRequest(new URL(event.request.url))) {
      event.respondWith(normalizeGoogleAiStudioRequest(event.request));
    }
    return;
  }

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
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(windowClients => {
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
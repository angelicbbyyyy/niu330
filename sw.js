// Service Worker 文件 (sw.js) - 强力保活版

const CACHE_VERSION = 'v1.7.34';
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

function extractGoogleApiKey(url, headers) {
  const authHeader = headers.get('Authorization') || headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const googApiKey = headers.get('x-goog-api-key');
  if (googApiKey) {
    return googApiKey.trim();
  }

  const altApiKey = headers.get('api-key');
  if (altApiKey) {
    return altApiKey.trim();
  }

  return url.searchParams.get('key') || '';
}

function buildOpenAIHeaders(requestHeaders, apiKey) {
  const headers = new Headers(requestHeaders);
  headers.delete('x-goog-api-key');
  headers.delete('api-key');
  if (apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function buildGoogleAiStudioTarget(body, apiKey) {
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
  if (!isGoogleAiStudioRequest(url)) {
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

  const apiKey = extractGoogleApiKey(url, request.headers);

  if (isGoogleAiStudioOpenAIPath(url) && isOpenAICompatibleBody(body)) {
    const headers = buildOpenAIHeaders(request.headers, apiKey);
    try {
      return await fetch(url.toString(), {
        method: request.method,
        headers,
        body: bodyText
      });
    } catch (error) {
      console.warn('SW: Google AI Studio OpenAI 请求头规范化失败，回退原请求。', error);
      return fetch(request);
    }
  }

  if (isGoogleAiStudioNativePath(url)) {
    return fetch(request);
  }

  const normalizedUrl = buildGoogleAiStudioTarget(body, apiKey);
  if (!normalizedUrl) {
    return fetch(request);
  }

  const headers = isOpenAICompatibleBody(body)
    ? buildOpenAIHeaders(request.headers, apiKey)
    : new Headers(request.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

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

setInterval(() => {}, 20000);

self.addEventListener('install', event => {
  console.log('Service Worker 正在安装 (保活增强版)...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker 正在激活...');
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim())
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
    caches.match(event.request).then(cachedResponse => cachedResponse || fetch(event.request))
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
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
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
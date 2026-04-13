// Service Worker 文件 (sw.js) - 强力保活版

// 缓存版本号
const CACHE_VERSION = 'v1.7.37'; // 版本号+1
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

function extractGoogleApiKey(url, headers) {
  const bearer = headers.get('authorization') || headers.get('Authorization');
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
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

function normalizeModelName(model) {
  if (typeof model !== 'string') {
    return '';
  }
  return model.replace(/^models\//, '').trim();
}

function extractTextFromContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (content && typeof content.text === 'string') {
    return content.text;
  }

  return '';
}

function convertOpenAiMessagesToGemini(messages) {
  const contents = [];
  const systemParts = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message) {
      continue;
    }

    const role = message.role || 'user';
    const text = extractTextFromContent(message.content).trim();
    if (!text) {
      continue;
    }

    if (role === 'system') {
      systemParts.push({ text });
      continue;
    }

    contents.push({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    });
  }

  const result = { contents };
  if (systemParts.length) {
    result.systemInstruction = { parts: systemParts };
  }
  return result;
}

function buildGenerationConfig(body) {
  const config = {};

  if (typeof body.temperature === 'number') {
    config.temperature = body.temperature;
  }
  if (typeof body.top_p === 'number') {
    config.topP = body.top_p;
  }
  if (typeof body.top_k === 'number') {
    config.topK = body.top_k;
  }
  if (typeof body.max_output_tokens === 'number') {
    config.maxOutputTokens = body.max_output_tokens;
  } else if (typeof body.max_tokens === 'number') {
    config.maxOutputTokens = body.max_tokens;
  }

  return Object.keys(config).length ? config : undefined;
}

function buildNativeGeminiRequest(body) {
  if (Array.isArray(body.contents)) {
    const nativeBody = { contents: body.contents };
    if (body.systemInstruction) {
      nativeBody.systemInstruction = body.systemInstruction;
    }
    if (body.generationConfig) {
      nativeBody.generationConfig = body.generationConfig;
    }
    if (Array.isArray(body.safetySettings)) {
      nativeBody.safetySettings = body.safetySettings;
    }
    return nativeBody;
  }

  if (Array.isArray(body.messages)) {
    const converted = convertOpenAiMessagesToGemini(body.messages);
    const generationConfig = buildGenerationConfig(body);
    if (generationConfig) {
      converted.generationConfig = generationConfig;
    }
    if (Array.isArray(body.safetySettings)) {
      converted.safetySettings = body.safetySettings;
    }
    return converted;
  }

  return null;
}

function buildMinimalGoogleHeaders(withJsonBody) {
  const headers = new Headers();
  if (withJsonBody) {
    headers.set('content-type', 'application/json');
  }
  return headers;
}

async function normalizeGoogleAiStudioRequest(request) {
  const url = new URL(request.url);
  if (!isGoogleAiStudioRequest(url)) {
    return fetch(request);
  }

  const apiKey = extractGoogleApiKey(url, request.headers);

  if (request.method === 'GET') {
    const modelUrl = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    if (apiKey) {
      modelUrl.searchParams.set('key', apiKey);
    }

    if (url.pathname.endsWith('/models') || url.pathname.endsWith('/models/')) {
      return fetch(modelUrl.toString(), { method: 'GET', headers: buildMinimalGoogleHeaders(false) });
    }

    return fetch(request);
  }

  let bodyText = '';
  try {
    bodyText = await request.clone().text();
  } catch (error) {
    console.warn('SW: 无法读取 Google 请求体，保持原请求。', error);
    return fetch(request);
  }

  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (error) {
    return fetch(request);
  }

  const model = normalizeModelName(body.model);
  const nativeBody = buildNativeGeminiRequest(body);
  if (!model || !nativeBody) {
    return fetch(request);
  }

  const targetUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  if (apiKey) {
    targetUrl.searchParams.set('key', apiKey);
  }

  console.log('SW: Google 请求已切换到原生 Gemini 路径。', targetUrl.pathname);

  return fetch(targetUrl.toString(), {
    method: 'POST',
    headers: buildMinimalGoogleHeaders(true),
    body: JSON.stringify(nativeBody)
  });
}

// --- 强力保活核心代码 Start ---
// 只要浏览器允许，这个 Interval 会一直运行，试图保持 SW 活跃
setInterval(() => {
    // 像看门狗一样，每20秒检查一次
}, 20000);
// --- 强力保活核心代码 End ---

// 1. 安装事件
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

// 2. 激活事件
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

// 3. 拦截网络请求
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/_keep_alive_ping_')) {
      event.respondWith(new Response('pong'));
      return;
  }

  if (isGoogleAiStudioRequest(new URL(event.request.url))) {
    event.respondWith(normalizeGoogleAiStudioRequest(event.request));
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

// 4. 监听消息（配合主线程心跳）
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
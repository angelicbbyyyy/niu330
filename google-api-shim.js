(() => {
  const nativeFetch = window.fetch.bind(window);
  const GOOGLE_HOST = 'generativelanguage.googleapis.com';
  const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const CORS_PROXY_BASE = 'https://corsproxy.io/?url=';

  function isGoogleUrl(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      return url.hostname === GOOGLE_HOST;
    } catch {
      return false;
    }
  }

  function getUrl(input) {
    return new URL(typeof input === 'string' ? input : input.url, window.location.href);
  }

  function buildProxyUrl(targetUrl) {
    return `${CORS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
  }

  async function fetchWithCorsFallback(targetUrl, options, label) {
    try {
      return await nativeFetch(targetUrl, options);
    } catch (error) {
      console.warn(`Google API ${label} request failed directly, retrying through CORS proxy.`, error);
      return nativeFetch(buildProxyUrl(targetUrl), options);
    }
  }

  function extractApiKey(url, headers) {
    const authHeader = headers.get('authorization') || headers.get('Authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }

    const googApiKey = headers.get('x-goog-api-key');
    if (googApiKey) {
      return googApiKey.trim();
    }

    const apiKey = headers.get('api-key');
    if (apiKey) {
      return apiKey.trim();
    }

    return url.searchParams.get('key') || '';
  }

  function normalizeModelName(model) {
    if (typeof model !== 'string') {
      return '';
    }
    return model.replace(/^models\//, '').trim();
  }

  function extractModelFromPath(pathname) {
    const marker = '/models/';
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) {
      return '';
    }

    const tail = pathname.slice(markerIndex + marker.length);
    const encodedModel = tail.split(':')[0];
    try {
      return normalizeModelName(decodeURIComponent(encodedModel));
    } catch {
      return normalizeModelName(encodedModel);
    }
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

  function buildNativeGeminiBody(body) {
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
      const nativeBody = convertOpenAiMessagesToGemini(body.messages);
      const generationConfig = buildGenerationConfig(body);
      if (generationConfig) {
        nativeBody.generationConfig = generationConfig;
      }
      if (Array.isArray(body.safetySettings)) {
        nativeBody.safetySettings = body.safetySettings;
      }
      return nativeBody;
    }

    return null;
  }

  function buildMinimalHeaders(withJsonBody) {
    const headers = new Headers();
    if (withJsonBody) {
      headers.set('content-type', 'application/json');
    }
    return headers;
  }

  function buildModelsUrl(apiKey) {
    const modelUrl = new URL(`${GOOGLE_BASE}/models`);
    if (apiKey) {
      modelUrl.searchParams.set('key', apiKey);
    }
    return modelUrl.toString();
  }

  function buildGenerateContentUrl(model, apiKey) {
    const targetUrl = new URL(`${GOOGLE_BASE}/models/${model}:generateContent`);
    if (apiKey) {
      targetUrl.searchParams.set('key', apiKey);
    }
    return targetUrl.toString();
  }

  async function normalizeGoogleRequest(input, init) {
    const originalUrl = getUrl(input);
    const originalRequest = input instanceof Request ? input : null;
    const mergedHeaders = new Headers(init?.headers || (originalRequest ? originalRequest.headers : undefined));
    const apiKey = extractApiKey(originalUrl, mergedHeaders);
    const method = (init?.method || (originalRequest ? originalRequest.method : 'GET') || 'GET').toUpperCase();

    if (method === 'GET') {
      if (originalUrl.pathname.endsWith('/models') || originalUrl.pathname.endsWith('/models/')) {
        return fetchWithCorsFallback(
          buildModelsUrl(apiKey),
          { method: 'GET', headers: buildMinimalHeaders(false) },
          'models'
        );
      }
      return nativeFetch(input, init);
    }

    let bodyText = '';
    if (typeof init?.body === 'string') {
      bodyText = init.body;
    } else if (originalRequest) {
      bodyText = await originalRequest.clone().text();
    }

    let body;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return nativeFetch(input, init);
    }

    const model = normalizeModelName(body.model) || extractModelFromPath(originalUrl.pathname);
    const nativeBody = buildNativeGeminiBody(body);
    if (!model || !nativeBody) {
      return nativeFetch(input, init);
    }

    return fetchWithCorsFallback(
      buildGenerateContentUrl(model, apiKey),
      {
        method: 'POST',
        headers: buildMinimalHeaders(true),
        body: JSON.stringify(nativeBody)
      },
      'generateContent'
    );
  }

  window.fetch = async function patchedFetch(input, init) {
    if (!isGoogleUrl(input)) {
      return nativeFetch(input, init);
    }

    try {
      return await normalizeGoogleRequest(input, init);
    } catch (error) {
      console.warn('Google API shim fallback to original fetch after normalization error.', error);
      return nativeFetch(input, init);
    }
  };
})();
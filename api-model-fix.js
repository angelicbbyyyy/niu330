function normalizeApiBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function isGoogleModelsApi(url) {
  return /generativelanguage\.googleapis\.com/i.test(url);
}

function buildModelsRequest(baseUrl, apiKey) {
  const normalized = normalizeApiBaseUrl(baseUrl);

  if (isGoogleModelsApi(normalized)) {
    const withoutModelsSuffix = normalized.replace(/\/models$/i, "");
    return {
      url: `${withoutModelsSuffix}/models?key=${encodeURIComponent(apiKey)}`,
      options: { method: "GET" },
      provider: "google",
    };
  }

  const modelsUrl = /\/models$/i.test(normalized)
    ? normalized
    : /\/v\d+(beta\d+)?$/i.test(normalized)
      ? `${normalized}/models`
      : `${normalized}/v1/models`;
  return {
    url: modelsUrl,
    options: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    provider: "openai-compatible",
  };
}

function normalizeModelList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.models)) {
    return payload.models.map((model) => {
      const rawId = model?.id || model?.name || "";
      const normalizedId = rawId.includes("/") ? rawId.split("/").pop() : rawId;
      return {
        id: normalizedId,
        label: model?.displayName || normalizedId,
      };
    });
  }

  if (Array.isArray(payload?.result?.models)) {
    return payload.result.models;
  }

  if (Array.isArray(payload?.result?.data)) {
    return payload.result.data;
  }

  return null;
}

async function parseErrorResponse(response) {
  try {
    const payload = await response.json();
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.detail ||
      payload?.error ||
      `HTTP ${response.status}`;
    return { message, payload };
  } catch (_error) {
    const text = await response.text();
    return {
      message: text || `HTTP ${response.status}`,
      payload: text || null,
    };
  }
}

function replaceNodeWithoutListeners(node) {
  if (!node || !node.parentNode) return node;
  const clone = node.cloneNode(true);
  node.parentNode.replaceChild(clone, node);
  return clone;
}

function attachModelFetchHandler(buttonId, urlInputId, keyInputId, selectId, successMessage) {
  const originalButton = document.getElementById(buttonId);
  const button = replaceNodeWithoutListeners(originalButton);
  if (!button) return;

  button.addEventListener("click", async () => {
    const urlInput = document.getElementById(urlInputId);
    const keyInput = document.getElementById(keyInputId);
    const select = document.getElementById(selectId);

    const baseUrl = normalizeApiBaseUrl(urlInput?.value);
    const apiKey = String(keyInput?.value || "").trim();

    if (!baseUrl || !apiKey) {
      alert("请先填写完整的 API 地址和 API Key");
      return;
    }

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "拉取中...";

    try {
      const request = buildModelsRequest(baseUrl, apiKey);
      const response = await fetch(request.url, request.options);

      if (!response.ok) {
        const errorInfo = await parseErrorResponse(response);
        console.error("Model fetch failed:", {
          request,
          status: response.status,
          error: errorInfo,
        });
        throw new Error(errorInfo.message);
      }

      const payload = await response.json();
      const models = normalizeModelList(payload);

      if (!Array.isArray(models)) {
        console.error("Unexpected model list payload:", payload);
        throw new Error("API返回了非预期的格式");
      }

      const previousValue = select?.value || "";
      if (select) {
        select.innerHTML = "";
      }

      models.forEach((model) => {
        const id = model?.id || model?.name || model?.model || "";
        if (!id || !select) return;

        const option = document.createElement("option");
        option.value = id;
        option.textContent = model?.label || model?.displayName || id;
        if (id === previousValue) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      if (select && !select.value && select.options.length > 0) {
        select.selectedIndex = 0;
      }

      alert(successMessage);
    } catch (error) {
      console.error("Fetch models error:", error);
      alert(`拉取模型失败: ${error?.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

window.addEventListener("load", () => {
  attachModelFetchHandler("fetch-models-btn", "proxy-url", "api-key", "model-select", "模型列表已更新");
  attachModelFetchHandler(
    "fetch-secondary-models-btn",
    "secondary-proxy-url",
    "secondary-api-key",
    "secondary-model-select",
    "副模型列表已更新",
  );
});

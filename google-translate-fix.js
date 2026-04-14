(function () {
  const TARGET_LANGUAGE = "en";
  const STORAGE_KEY = "niu330_auto_translate_lang";
  let translateAttempts = 0;
  let translateObserver = null;

  function setStoredLanguage(language) {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (_error) {}
  }

  function getStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY) || TARGET_LANGUAGE;
    } catch (_error) {
      return TARGET_LANGUAGE;
    }
  }

  function findTranslateSelect() {
    return document.querySelector(".goog-te-combo");
  }

  function triggerLanguage(language) {
    const select = findTranslateSelect();
    if (!select) return false;
    if (select.value === language) return true;

    select.value = language;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function ensureTranslation(language = getStoredLanguage()) {
    if (triggerLanguage(language)) {
      document.documentElement.setAttribute("lang", language);
      setStoredLanguage(language);
      return;
    }

    translateAttempts += 1;
    if (translateAttempts > 30) return;
    window.setTimeout(() => ensureTranslation(language), 500);
  }

  function observeForTranslateWidget() {
    if (translateObserver) return;
    translateObserver = new MutationObserver(() => {
      if (findTranslateSelect()) {
        ensureTranslation();
      }
    });

    translateObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  window.googleTranslateElementInit = function () {
    if (!window.google || !window.google.translate) return;

    new window.google.translate.TranslateElement(
      {
        pageLanguage: "zh-CN",
        includedLanguages: "en,zh-CN",
        autoDisplay: false,
        layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
      },
      "google_translate_element",
    );

    observeForTranslateWidget();
    window.setTimeout(() => ensureTranslation(), 300);
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("notranslate-ready");
    observeForTranslateWidget();
    window.setTimeout(() => ensureTranslation(), 1200);
  });

  window.addEventListener("load", () => {
    window.setTimeout(() => ensureTranslation(), 1800);
  });
})();

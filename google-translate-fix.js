(function () {
  const TARGET_LANGUAGE = "en";
  const STORAGE_KEY = "niu330_auto_translate_lang";
  const SESSION_RELOAD_KEY = "niu330_translate_reload_once";
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

  function setGoogleTranslateCookie(language) {
    const cookieValue = `/zh-CN/${language}`;
    const baseCookie = `googtrans=${cookieValue};path=/`;
    document.cookie = baseCookie;

    const hostname = window.location.hostname.replace(/^www\./i, "");
    if (hostname.includes(".")) {
      document.cookie = `${baseCookie};domain=.${hostname}`;
    }
  }

  function markTranslationApplied(language) {
    document.documentElement.setAttribute("lang", language);
    setStoredLanguage(language);
    setGoogleTranslateCookie(language);
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
    markTranslationApplied(language);

    if (triggerLanguage(language)) {
      try {
        sessionStorage.removeItem(SESSION_RELOAD_KEY);
      } catch (_error) {}
      return;
    }

    translateAttempts += 1;
    if (translateAttempts === 12) {
      try {
        if (!sessionStorage.getItem(SESSION_RELOAD_KEY)) {
          sessionStorage.setItem(SESSION_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch (_error) {}
    }

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

    markTranslationApplied(getStoredLanguage());
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
    markTranslationApplied(getStoredLanguage());
    document.body.classList.add("notranslate-ready");
    observeForTranslateWidget();
    window.setTimeout(() => ensureTranslation(), 1200);
  });

  window.addEventListener("load", () => {
    markTranslationApplied(getStoredLanguage());
    window.setTimeout(() => ensureTranslation(), 1800);
  });
})();

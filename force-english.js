(function () {
  const TARGET_LANGUAGE = "en";
  const STORAGE_KEY = "language";
  let applyAttempts = 0;

  function persistLanguage() {
    try {
      localStorage.setItem(STORAGE_KEY, TARGET_LANGUAGE);
    } catch (_error) {}
  }

  function updateLanguageSelect() {
    const select = document.getElementById("language-select");
    if (!select) return false;

    if (select.value !== TARGET_LANGUAGE) {
      select.value = TARGET_LANGUAGE;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return true;
  }

  function applyEnglishMode() {
    persistLanguage();

    if (typeof window.setLanguage === "function") {
      try {
        window.setLanguage(TARGET_LANGUAGE);
        return true;
      } catch (_error) {}
    }

    return updateLanguageSelect();
  }

  function ensureEnglishMode() {
    applyAttempts += 1;
    const applied = applyEnglishMode();

    if (applied || applyAttempts > 40) {
      document.documentElement.lang = TARGET_LANGUAGE;
      return;
    }

    window.setTimeout(ensureEnglishMode, 500);
  }

  persistLanguage();
  document.documentElement.lang = TARGET_LANGUAGE;

  document.addEventListener("DOMContentLoaded", () => {
    persistLanguage();
    ensureEnglishMode();
  });

  window.addEventListener("load", () => {
    persistLanguage();
    ensureEnglishMode();
  });
})();

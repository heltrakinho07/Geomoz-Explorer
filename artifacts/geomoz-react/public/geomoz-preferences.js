/* GeoMoz interface preferences — shared by the portal and GIS Workspace.
 * Same origin, no user identifiers and no credentials. Keeps the existing
 * GeoLibre/i18next settings schema so preferences survive module navigation.
 */
(() => {
  "use strict";
  if (window.GeoMozPreferences) return;
  const languageKey = "geomoz_language";
  const engineKey = "geolibre.desktopSettings";
  const motionKey = "geomoz_reduce_motion";
  const listeners = new Set();
  // Match GeoLibre's resolveLanguage: full tags first, then their base language.
  // Only shipped base catalog codes may be persisted; unsupported locales
  // must not leave the portal and embedded GIS displaying different languages.
  const shippedLanguages = new Set([
    "en","az","he","zh","es","fa","fr","de","pt","ja","ko",
    "ru","nl","it","id","tr","hi","ar","ka","th","vi"
  ]);
  const resolveLanguage = raw => {
    if (typeof raw !== "string") return null;
    const normalized = raw.trim().toLowerCase().replace(/_/g,"-");
    if (!normalized || !/^[a-z]{2}(?:-[a-z]{2})?$/.test(normalized)) return null;
    return shippedLanguages.has(normalized) ? normalized :
      (shippedLanguages.has(normalized.split("-")[0]) ? normalized.split("-")[0] : null);
  };
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const parseEngineLanguage = () => {
    try {
      const language = JSON.parse(read(engineKey) || "{}").language;
      return resolveLanguage(language);
    } catch { return null; }
  };
  let language = resolveLanguage(read(languageKey)) || parseEngineLanguage() || "pt";
  let reducedMotion = read(motionKey) === "true";
  const announce = () => {
    const next = { language, reducedMotion };
    for (const callback of listeners) callback(next);
    window.dispatchEvent(new CustomEvent("geomoz_preferences_changed", { detail: next }));
  };
  const applyMotion = () => {
    document.documentElement.dataset.geomozReducedMotion = String(reducedMotion);
  };
  function commitLanguage(next, persist = true) {
    const code = resolveLanguage(next);
    if (!code) return false;
    const changed = code !== language;
    language = code;
    // The portal remains Portuguese until its own strings are translated.
    // Do not falsely label Portuguese content as another language for assistive technologies.
    if (document.body?.dataset.geomozApp === "workbench") document.documentElement.lang = next;
    if (persist) {
      try {
        localStorage.setItem(languageKey, code);
        const previous = JSON.parse(read(engineKey) || "{}");
        const updated = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
        if (updated.language !== code) localStorage.setItem(engineKey, JSON.stringify({ ...updated, language: code }));
      } catch { /* Private browsing / denied storage must not block the interface. */ }
    }
    if (changed) announce();
    return true;
  }
  function commitMotion(enabled, persist = true) {
    if (typeof enabled !== "boolean") return;
    const changed = reducedMotion !== enabled;
    reducedMotion = enabled;
    applyMotion();
    if (persist) try { localStorage.setItem(motionKey, String(enabled)); } catch {}
    if (changed) announce();
  }
  window.GeoMozPreferences = Object.freeze({
    getLanguage: () => language,
    setLanguage: code => commitLanguage(code),
    getReducedMotion: () => reducedMotion,
    setReducedMotion: enabled => commitMotion(enabled),
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  });
  window.addEventListener("storage", event => {
    if (event.key === engineKey) {
      // GeoLibre's own Settings may write only geolibre.desktopSettings.
      // That update wins over a stale geomoz_language and is mirrored so
      // the next browser reload does not silently undo the native switch.
      commitLanguage(parseEngineLanguage() || resolveLanguage(read(languageKey)) || "pt");
    } else if (event.key === languageKey) {
      commitLanguage(resolveLanguage(read(languageKey)) || parseEngineLanguage() || "pt");
    } else if (event.key === null) {
      commitLanguage(resolveLanguage(read(languageKey)) || parseEngineLanguage() || "pt",false);
    }
    if (event.key === motionKey || event.key === null) commitMotion(read(motionKey) === "true", false);
  });
  commitLanguage(language, false);
  applyMotion();
})();

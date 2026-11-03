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
  const supportedCode = code => typeof code === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(code);
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const parseEngineLanguage = () => {
    try {
      const language = JSON.parse(read(engineKey) || "{}").language;
      return supportedCode(language) ? language : null;
    } catch { return null; }
  };
  let language = (supportedCode(read(languageKey)) ? read(languageKey) : parseEngineLanguage()) || "pt";
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
    if (!supportedCode(next)) return false;
    const changed = next !== language;
    language = next;
    // The portal remains Portuguese until its own strings are translated.
    // Do not falsely label Portuguese content as another language for assistive technologies.
    if (document.body?.dataset.geomozApp === "workbench") document.documentElement.lang = next;
    if (persist) {
      try {
        localStorage.setItem(languageKey, next);
        const previous = JSON.parse(read(engineKey) || "{}");
        const updated = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
        if (updated.language !== next) localStorage.setItem(engineKey, JSON.stringify({ ...updated, language: next }));
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
    if (event.key === languageKey || event.key === engineKey || event.key === null) {
      const incoming = supportedCode(read(languageKey)) ? read(languageKey) : parseEngineLanguage();
      commitLanguage(incoming || "pt", false);
    }
    if (event.key === motionKey || event.key === null) commitMotion(read(motionKey) === "true", false);
  });
  commitLanguage(language, false);
  applyMotion();
})();

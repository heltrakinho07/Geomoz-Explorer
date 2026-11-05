/* GeoMoz global colour mode. Shared by the portal and GIS Workbench. */
(() => {
  "use strict";
  if (window.GeoMozTheme) return;
  const key = "geomoz_theme", subscribers = new Set();
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const valid = value => value === "dark" || value === "light";
  const system = () => media?.matches ? "dark" : "light";
  const saved = () => { try { return localStorage.getItem(key); } catch { return null; } };
  let mode = valid(saved()) ? saved() : system();
  function apply() {
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.documentElement.dataset.geomozTheme = mode;
    document.documentElement.style.colorScheme = mode;
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.content = mode === "dark" ? "#071525" : "#f4f7fb";
    });
  }
  function commit(next, persist = true, announce = true) {
    if (!valid(next)) return;
    const changed = next !== mode;
    mode = next;
    if (persist) try { localStorage.setItem(key, mode); } catch {}
    apply();
    if (changed) {
      subscribers.forEach(callback => callback(mode));
      if (announce) window.dispatchEvent(new CustomEvent("geomoz_theme_changed", {detail:mode}));
    }
  }
  window.GeoMozTheme = Object.freeze({
    getTheme: () => mode,
    setTheme: next => commit(next),
    toggle: () => commit(mode === "dark" ? "light" : "dark"),
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
  });
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) commit(valid(event.newValue) ? event.newValue : system(), false);
  });
  window.addEventListener("geomoz_theme_changed", event => {
    if (valid(event.detail) && event.detail !== mode) commit(event.detail, true, false);
  });
  media?.addEventListener?.("change", () => { if (!valid(saved())) commit(system(), false); });
  apply();
})();

/* GeoMoz GIS chrome: menu delegation only. MIT GeoLibre remains the GIS engine.
   Never synthesize map, processing or project actions: open the actual upstream
   menu instead, so it retains its permissions, dialogs and callbacks. */
(() => {
  "use strict";
  const groups = {
    Project: ["Project", "Projeto", "Projecto", "Projet"],
    "Add Data": ["Add Data", "Adicionar Dados", "Adicionar dados", "Añadir datos", "Données"],
    Edit: ["Edit", "Editar", "Édition", "Edición"],
    View: ["View", "Vista", "Ver", "Affichage"],
    Processing: ["Processing", "Processamento", "Procesamiento", "Traitement"],
    Controls: ["Controls", "Controlos", "Controles", "Contrôles"],
    Plugins: ["Plugins", "Extensões", "Extensions", "Complementos"],
    Settings: ["Settings", "Configurações", "Configuración", "Paramètres"]
  };
  const normalize = (v) =>
    String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const getNativeHeader = () => document.querySelector('[data-testid="desktop-shell"] header.bg-card.border-b')
    || document.querySelector('#root header.bg-card.border-b');
  const openMenu = (key) => {
    const header = getNativeHeader();
    if (!header) return false;
    const options = (groups[key] || []).map(normalize);
    const candidates = Array.from(header.querySelectorAll('button'));
    const button = candidates.find((b) => options.includes(normalize(b.textContent)))
      || candidates.find((b) => options.some((v) => normalize(b.getAttribute("aria-label")) === v));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  };
  document.addEventListener("click", (event) => {
    const btn = event.target.closest?.("[data-geomoz-menu]");
    if (!btn) return;
    const ok = openMenu(btn.getAttribute("data-geomoz-menu"));
    const status = document.getElementById("geomoz-gis-command-status");
    if (status) status.textContent = ok ? "" : "Abra a ferramenta pelo menu SIG abaixo.";
  });
})();

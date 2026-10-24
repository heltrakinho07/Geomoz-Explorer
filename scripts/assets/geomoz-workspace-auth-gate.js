/* GeoMoz GIS Workspace — same-origin Firebase sign-in gate.
 * The real GIS application scripts are inserted ONLY after positive Firebase
 * session confirmation from the GeoMoz portal. No tokens are passed around.
 * The static bundle remains public on Firebase Hosting; never store secrets
 * or sensitive user data in publicly hosted assets.
 */
(() => {
  "use strict";

  const ENTRYPOINTS = __GEOMOZ_ENTRYPOINTS__;
  const MESSAGE_TYPE = "geomoz:workspace-auth-state";
  const LOGIN_URL = "/login?next=%2Fgis-workspace%2F";
  let loaded = false;
  let authorized = false;
  let timeoutId;
  let bridge;

  const splash = () => document.getElementById("geomoz-auth-splash");
  const setStatus = (message, failed) => {
    const text = document.getElementById("geomoz-auth-status");
    if (text) text.textContent = message;
    const login = document.getElementById("geomoz-auth-login");
    if (login) login.hidden = !failed;
  };

  function redirectToLogin() {
    window.location.replace(LOGIN_URL);
  }

  function loadWorkspace() {
    if (loaded) return;
    loaded = true;
    document.body.dataset.geomozAuth = "allowed";
    splash()?.remove();
    // Preserve the build's original module/classic order, no GIS JS before auth.
    for (const entry of ENTRYPOINTS) {
      const script = document.createElement("script");
      if (entry.module) script.type = "module";
      if (entry.crossorigin) script.crossOrigin = "anonymous";
      script.src = entry.src;
      script.onerror = () => {
        document.body.dataset.geomozAuth = "pending";
        setStatus("Não foi possível carregar o GIS Workspace. Recarregue a página.", true);
      };
      document.body.appendChild(script);
    }
  }

  function handleMessage(event) {
    if (
      event.origin !== window.location.origin ||
      event.source !== bridge?.contentWindow ||
      event.data?.type !== MESSAGE_TYPE ||
      typeof event.data.authenticated !== "boolean"
    ) return;

    clearTimeout(timeoutId);
    authorized = event.data.authenticated;
    if (!authorized) {
      // Includes guest/demo mode and sessions revoked from another tab.
      document.body.dataset.geomozAuth = "pending";
      redirectToLogin();
      return;
    }
    loadWorkspace();
  }

  function initialize() {
    if (!Array.isArray(ENTRYPOINTS) || !ENTRYPOINTS.length) {
      setStatus("O GIS Workspace não pôde ser iniciado em segurança.", true);
      return;
    }
    const btn = document.getElementById("geomoz-auth-login");
    btn?.addEventListener("click", redirectToLogin);
    document.body.dataset.geomozAuth = "pending";
    window.addEventListener("message", handleMessage);

    bridge = document.createElement("iframe");
    bridge.src = "/auth/workspace-check";
    bridge.title = "Verificação da sessão GeoMoz";
    bridge.hidden = true;
    bridge.setAttribute("aria-hidden", "true");
    bridge.setAttribute("tabindex", "-1");
    bridge.style.display = "none";
    bridge.onerror = () => setStatus("Erro na verificação da sessão. Inicie sessão no GeoMoz.", true);
    document.body.appendChild(bridge);

    // Fail closed on network/offline errors: never start GIS without auth.
    timeoutId = window.setTimeout(() => {
      if (!authorized) setStatus("Não foi possível validar a sessão. Verifique a ligação e entre novamente.", true);
    }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();

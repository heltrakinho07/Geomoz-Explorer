// Base URL for the GeoMoz backend API.
//
// - Web (Vite dev/preview): "" so requests stay relative (e.g. "/geomoz-api/...")
//   and are handled by Vite's dev proxy → http://localhost:5003.
// - Electron desktop: the app is loaded from file://, where there is no proxy, so
//   requests must target the bundled FastAPI backend on localhost directly.
//
// `window.electronAPI` is exposed by the Electron preload script, so its presence
// is a reliable signal that we are running inside the desktop shell.
export const API_BASE =
  typeof window !== "undefined" && (window as { electronAPI?: unknown }).electronAPI
    ? "http://127.0.0.1:5003"
    : "";

/** Prefix an API path with the environment-appropriate base URL. */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

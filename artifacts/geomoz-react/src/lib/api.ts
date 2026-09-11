/**
 * Base URL for the GeoMoz backend API.
 *
 * Priority:
 *   1. `VITE_API_BASE` env var (set at build time for Railway/production)
 *   2. Electron desktop → localhost:5003 (detected via window.electronAPI)
 *   3. Web dev/preview → empty string (requests are relative, handled by
 *      Vite's dev proxy → http://localhost:5003)
 *
 * Railway deployment: set VITE_API_BASE to the backend's Railway URL,
 * e.g. `https://backend-production.up.railway.app`
 */

export const API_BASE: string = (() => {
  // 1. Build-time env var (Vite exposes VITE_* vars via import.meta.env)
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) {
    return String(import.meta.env.VITE_API_BASE);
  }

  // 2. Electron desktop
  if (
    typeof window !== "undefined" &&
    (window as { electronAPI?: unknown }).electronAPI
  ) {
    return "http://127.0.0.1:5003";
  }

  // 3. Web dev/preview (relative → Vite proxy handles it)
  return "";
})();

/** Prefix an API path with the environment-appropriate base URL. */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;

import { auth } from "./firebase";

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const token = auth.currentUser ? await auth.currentUser.getIdToken(false) : null;
  const headers = { ...options?.headers } as Record<string, string>;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

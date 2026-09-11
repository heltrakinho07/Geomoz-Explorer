/**
 * Base URL for the GeoMoz backend API.
 */

export const API_BASE: string = (() => {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) {
    return String(import.meta.env.VITE_API_BASE);
  }
  if (
    typeof window !== "undefined" &&
    (window as { electronAPI?: unknown }).electronAPI
  ) {
    return "http://127.0.0.1:5003";
  }
  return "";
})();

/** Prefix an API path with the environment-appropriate base URL. */
export const apiUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

import { auth } from "./firebase";

export async function apiFetch(inputUrlOrPath: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(inputUrlOrPath);
  const token = auth?.currentUser ? await auth.currentUser.getIdToken(false) : null;
  const headers = new Headers(options?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}

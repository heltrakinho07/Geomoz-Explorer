/**
 * GeoMoz API transport.
 * On Firebase Hosting, requests MUST use the same-origin /geomoz-api rewrite.
 * A direct Cloud Run URL would bypass the reverse proxy and is susceptible to
 * CORS, blocked cross-site requests, and stale service URLs.
 */
export const FIREBASE_HOSTNAMES = new Set([
  "geomoz.geolithica.com",
  "geoprocessamento-426809.web.app",
  "geoprocessamento-426809.firebaseapp.com",
]);

export function resolveApiBase(
  hostname: string | undefined,
  configuredBase: string | undefined,
  isElectron = false
): string {
  if (hostname && FIREBASE_HOSTNAMES.has(hostname.toLowerCase())) {
    return ""; // Firebase Hosting forwards /geomoz-api/** to Cloud Run.
  }
  if (isElectron) return configuredBase?.trim().replace(/\/$/, "") || "http://127.0.0.1:5003";
  return configuredBase?.trim().replace(/\/$/, "") || "";
}

export const API_BASE: string = resolveApiBase(
  typeof window === "undefined" ? undefined : window.location.hostname,
  import.meta.env?.VITE_API_BASE,
  typeof window !== "undefined" &&
    Boolean((window as { electronAPI?: unknown }).electronAPI)
);

/** Prefix a same-origin or absolute endpoint path with the correct API base. */
export const apiUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

import { auth } from "./firebase";

export async function apiFetch(inputUrlOrPath: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(inputUrlOrPath);
  const token = auth?.currentUser ? await auth.currentUser.getIdToken(false).catch(() => null) : null;
  const headers = new Headers(options?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Never attach GEE OAuth access tokens from localStorage.
  try {
    return await fetch(url, { ...options, headers });
  } catch (caught) {
    if (caught instanceof TypeError) {
      // Never include query parameters or sensitive token values in the message.
      const path = inputUrlOrPath.split("?")[0];
      throw new Error(
        `Não foi possível contactar a API GeoMoz (${path}). Verifique a ligação, o estado do servidor Cloud Run e o encaminhamento /geomoz-api no Firebase Hosting. Se persistir, contacte o suporte.`
      );
    }
    throw caught;
  }
}

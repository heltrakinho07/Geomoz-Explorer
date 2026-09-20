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
  const token = auth?.currentUser ? await auth.currentUser.getIdToken(false).catch(() => null) : null;
  const headers = new Headers(options?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof window !== "undefined") {
    try {
      const uid = auth?.currentUser?.uid;
      const userProjectKey = uid && uid !== "guest_user" ? `geomoz_gee_user_${uid}_project` : null;
      const userTokenKey = uid && uid !== "guest_user" ? `geomoz_gee_user_${uid}_token` : null;
      const userTokenTsKey = uid && uid !== "guest_user" ? `geomoz_gee_user_${uid}_token_ts` : null;

      const geeProject = (userProjectKey ? localStorage.getItem(userProjectKey) : null)
        || localStorage.getItem("geomoz_gee_project");
      const geeToken = (userTokenKey ? localStorage.getItem(userTokenKey) : null)
        || localStorage.getItem("geomoz_gee_oauth_token");
      const geeTokenTs = (userTokenTsKey ? localStorage.getItem(userTokenTsKey) : null)
        || localStorage.getItem("geomoz_gee_oauth_token_timestamp");

      const isExpired = geeTokenTs && (Date.now() - parseInt(geeTokenTs, 10) > 50 * 60 * 1000);

      if (isExpired && geeToken) {
        try {
          if (userTokenKey) localStorage.removeItem(userTokenKey);
          if (userTokenTsKey) localStorage.removeItem(userTokenTsKey);
          localStorage.removeItem("geomoz_gee_oauth_token");
          localStorage.removeItem("geomoz_gee_oauth_token_timestamp");
        } catch {}
      }

      if (geeProject && !headers.has("X-GEE-Project")) {
        headers.set("X-GEE-Project", geeProject);
      }
      if (geeToken && !isExpired && !headers.has("X-GEE-Token")) {
        headers.set("X-GEE-Token", geeToken);
      }
    } catch {}
  }
  return fetch(url, { ...options, headers });
}

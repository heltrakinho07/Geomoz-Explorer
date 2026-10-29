/**
 * NextGIS QuickMapServices (QMS) public REST API adapter.
 * The QMS catalogue is a directory, NOT a licence to redistribute tiles.
 * Services are loaded only when a user explicitly selects one.
 *
 * API: https://docs.nextgis.com/qms_srv_dev/doc/api.html
 * Independent GeoMoz adapter; no GPL plugin code is copied here.
 */
export const QMS_API = "https://qms.nextgis.com/api/v1/geoservices/";

export interface QmsServiceSummary {
  id: number;
  name: string;
  description: string;
}

export interface QmsTileSource {
  id: number;
  name: string;
  url: string;
  tms: boolean;
  maxZoom: number;
  attribution: string;
  termsUrl?: string;
}

type JsonObject = Record<string, unknown>;

function asRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject : null;
}

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        host === "localhost" || host.endsWith(".local") ||
        /^(?:127|10|0)\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
        host === "[::1]") return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function parseQmsSearchResponse(value: unknown): QmsServiceSummary[] {
  const container = asRecord(value);
  const items = Array.isArray(value) ? value : container?.results;
  if (!Array.isArray(items)) throw new Error("Resposta inválida do catálogo NextGIS QMS.");
  return items.flatMap((candidate): QmsServiceSummary[] => {
    const item = asRecord(candidate);
    if (!item || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        item.type !== "tms" || Number(item.epsg) !== 3857 ||
        item.cumulative_status !== "works") return [];
    const name = cleanText(item.name, 120);
    if (!name) return [];
    return [{ id: Number(item.id), name, description: cleanText(item.desc, 240) }];
  });
}

export function parseQmsTileSource(value: unknown): QmsTileSource {
  const item = asRecord(value);
  if (!item || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
      item.type !== "tms" || Number(item.epsg) !== 3857 ||
      item.cumulative_status !== "works") {
    throw new Error("Este serviço não é um mapa TMS/XYZ Web Mercator funcional.");
  }
  const name = cleanText(item.name, 120);
  if (!name) throw new Error("O serviço não tem nome válido.");

  const rawUrl = cleanText(item.url, 2048);
  // Leaflet supports {x}, {y}, {z}, {s}. Reject unsupported QMS templates.
  if (!rawUrl || !["{x}", "{y}", "{z}"].every((token) => rawUrl.includes(token)) ||
      /\{[^}]+\}/g.test(rawUrl.replace(/\{[xyzs]\}/g, ""))) {
    throw new Error("O endereço do serviço utiliza um formato de mosaicos não suportado.");
  }
  // Replace tile placeholders only for URL validation, retaining the original template.
  const testUrl = safeHttpsUrl(rawUrl.replace(/\{[xyzs]\}/g, "0"));
  if (!testUrl) throw new Error("O serviço requer HTTPS público e não pode conter credenciais.");
  const parsed = new URL(testUrl);
  if ([...parsed.searchParams.keys()].some((key) =>
    /^(?:key|api_?key|access_?token|token|secret|signature)$/i.test(key))) {
    throw new Error("Este serviço necessita de credenciais ou de autorização própria.");
  }

  const author = cleanText(item.copyright_text, 200) || name;
  const termsUrl = safeHttpsUrl(item.terms_of_use_url) || safeHttpsUrl(item.license_url);
  const max = typeof item.z_max === "number" && Number.isFinite(item.z_max)
    ? Math.max(0, Math.min(22, Math.floor(item.z_max))) : 18;
  return {
    id: Number(item.id),
    name,
    url: rawUrl,
    tms: item.y_origin_top === false,
    maxZoom: max,
    attribution: "&copy; " + escapeHtml(author) +
      ' · <a href="https://qms.nextgis.com/" target="_blank" rel="noopener noreferrer">NextGIS QMS</a>',
    termsUrl,
  };
}

async function readJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("O catálogo QMS está indisponível (" + response.status + ").");
  return response.json();
}

/** Search is always restricted to reported-working EPSG:3857 tile services. */
export async function searchQmsBasemaps(query: string, signal?: AbortSignal): Promise<QmsServiceSummary[]> {
  const term = query.trim().slice(0, 100);
  if (term.length < 2) return [];
  const params = new URLSearchParams({
    type: "tms", epsg: "3857", cumulative_status: "works", search: term, limit: "12",
  });
  const json = await readJson(QMS_API + "?" + params.toString(), signal);
  return parseQmsSearchResponse(json);
}

export async function getQmsTileSource(id: number, signal?: AbortSignal): Promise<QmsTileSource> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Identificador QMS inválido.");
  const json = await readJson(QMS_API + id + "/", signal);
  const tile = parseQmsTileSource(json);
  if (tile.id !== id) throw new Error("O catálogo respondeu com outro serviço.");
  return tile;
}

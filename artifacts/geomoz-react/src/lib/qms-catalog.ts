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
  minZoom: number;
  /** Optional geographic coverage supplied by the provider, EPSG:4326. */
  extent?: QmsSearchBounds;
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
    if (!item || (typeof item.id !== "number" || !Number.isSafeInteger(item.id) || item.id < 1) ||
        item.type !== "tms" || Number(item.epsg) !== 3857 ||
        item.cumulative_status !== "works") return [];
    const name = cleanText(item.name, 120);
    if (!name) return [];
    return [{ id: Number(item.id), name, description: cleanText(item.desc, 240) }];
  });
}

export function parseQmsTileSource(value: unknown): QmsTileSource {
  const item = asRecord(value);
  if (!item || (typeof item.id !== "number" || !Number.isSafeInteger(item.id) || item.id < 1) ||
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
  const min = typeof item.z_min === "number" && Number.isFinite(item.z_min)
    ? Math.max(0, Math.min(max, Math.floor(item.z_min))) : 0;
  const extent = parseQmsExtent(item.extent);
  return {
    id: Number(item.id),
    name,
    url: rawUrl,
    tms: item.y_origin_top === false,
    maxZoom: max,
    minZoom: min,
    ...(extent ? { extent } : {}),
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

/** Geographic WGS84 bbox in west, south, east, north order. */
export type QmsSearchBounds = readonly [number, number, number, number];

/** Parse EPSG:4326 rectangular extent or polygon envelope without executing WKT. */
export function parseQmsExtent(value: unknown): QmsSearchBounds | undefined {
  if (typeof value !== "string" || value.length > 8192) return undefined;
  const normalized = value.trim().replace(/^SRID=4326;/i, "");
  if (!/^POLYGON\s*\(\(/i.test(normalized)) return undefined;
  const match = normalized.match(/^POLYGON\s*\(\(([^()]+)\)\)\s*$/i);
  if (!match) return undefined;
  const points = match[1].split(",").map((point) => point.trim().split(/\s+/).map(Number));
  if (points.length < 4 || points.some((point) =>
    point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
    point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90)) {
    return undefined;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const result: QmsSearchBounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return result[0] < result[2] && result[1] < result[3] ? result : undefined;
}

export interface QmsPreviewTile {
  url: string;
  zoom: number;
  x: number;
  y: number;
  longitude: number;
  latitude: number;
}

/**
 * Pick one representative mosaic for a visible browser preview.
 * This is a visual probe, not proof that every tile or the licence is valid.
 * Bottom-origin TMS services invert Y; XYZ does not.
 */
export function createQmsPreviewTile(source: QmsTileSource, region?: QmsSearchBounds): QmsPreviewTile | null {
  const coverage = source.extent;
  if (coverage && region && (coverage[2] < region[0] || coverage[0] > region[2] ||
    coverage[3] < region[1] || coverage[1] > region[3])) return null;
  const box = coverage && region
    ? [Math.max(coverage[0], region[0]), Math.max(coverage[1], region[1]),
       Math.min(coverage[2], region[2]), Math.min(coverage[3], region[3])]
    : coverage ?? region ?? [30, -27, 42, -10];
  const longitude = Math.max(-180, Math.min(180, (box[0] + box[2]) / 2));
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, (box[1] + box[3]) / 2));
  const zoom = Math.min(source.maxZoom, Math.max(source.minZoom, 12));
  const n = 2 ** zoom;
  const latRadians = latitude * Math.PI / 180;
  const x = Math.max(0, Math.min(n - 1, Math.floor((longitude + 180) / 360 * n)));
  const xyzY = Math.max(0, Math.min(n - 1,
    Math.floor((1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2 * n)));
  const y = source.tms ? n - xyzY - 1 : xyzY;
  const url = source.url.replace(/\{z\}/g, String(zoom)).replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y)).replace(/\{s\}/g, "a");
  return { url, zoom, x, y, longitude, latitude };
}

export function boundsToQmsWkt(bounds: QmsSearchBounds): string {
  const [west, south, east, north] = bounds;
  if (bounds.length !== 4 || !bounds.every(Number.isFinite) ||
      west < -180 || east > 180 || south < -90 || north > 90 ||
      west >= east || south >= north) {
    throw new Error("Área geográfica inválida para pesquisa de mapas-base.");
  }
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
}

/** Search working EPSG:3857 services, optionally intersecting a target region. */
export async function searchQmsBasemaps(
  query: string, signal?: AbortSignal, bounds?: QmsSearchBounds,
): Promise<QmsServiceSummary[]> {
  const term = query.trim().slice(0, 100);
  if (term.length < 2) return [];
  const params = new URLSearchParams({
    type: "tms", epsg: "3857", cumulative_status: "works", search: term, limit: "12",
  });
  if (bounds) params.set("intersects_extent", boundsToQmsWkt(bounds));
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

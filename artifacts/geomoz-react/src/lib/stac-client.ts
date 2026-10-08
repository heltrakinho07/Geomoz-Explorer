/**
 * Minimal, project-safe STAC client for the GeoMoz GIS Workspace.
 *
 * Inspired by GeoLibre's STAC API flow (MIT), but kept intentionally focused:
 * connect to a STAC API, discover collections, search items, expose raster/COG
 * assets, and resolve browser-readable asset URLs. Expiring signed URLs are
 * never persisted in project state.
 */

export const PLANETARY_COMPUTER_STAC =
  "https://planetarycomputer.microsoft.com/api/stac/v1";
export const EARTH_SEARCH_STAC = "https://earth-search.aws.element84.com/v1";

const PLANETARY_COMPUTER_HOST = "planetarycomputer.microsoft.com";
const PLANETARY_COMPUTER_SIGN_URL =
  "https://planetarycomputer.microsoft.com/api/sas/v1/sign";
const SIGNING_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface GISStacCollection {
  id: string;
  title?: string;
  description?: string;
}

export interface GISStacAsset {
  key: string;
  href: string;
  title?: string;
  type?: string;
  roles?: string[];
}

export interface GISStacItem {
  id: string;
  collection?: string;
  bbox?: number[];
  properties: Record<string, unknown>;
  assets: GISStacAsset[];
}

export interface GISStacConnection {
  url: string;
  title: string;
  description?: string;
  searchUrl: string;
  collections: GISStacCollection[];
}

export interface GISStacRasterSource {
  catalogUrl: string;
  collectionId?: string;
  itemId: string;
  assetKey: string;
  href: string;
}

interface StacLink {
  rel?: string;
  href?: string;
  type?: string;
}

interface RawStacAsset {
  href?: unknown;
  title?: unknown;
  type?: unknown;
  roles?: unknown;
}

const signedCache = new Map<string, { href: string; expiresAt: number }>();
const pendingSigned = new Map<string, Promise<string>>();

function absoluteHttpHref(href: string, base: string): string {
  const resolved = new URL(href, base);
  if (resolved.protocol === "s3:") {
    const bucket = resolved.hostname;
    if (!bucket) return resolved.toString();
    return `https://${bucket}.s3.amazonaws.com${resolved.pathname}${resolved.search}`;
  }
  return resolved.toString();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/geo+json,application/json,*/*",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`STAC request falhou: HTTP ${response.status} ${response.statusText}`.trim());
  }
  return (await response.json()) as T;
}

function links(value: unknown, base: string): StacLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.rel !== "string" || typeof raw.href !== "string") return [];
    try {
      return [
        {
          rel: raw.rel,
          href: new URL(raw.href, base).toString(),
          type: typeof raw.type === "string" ? raw.type : undefined,
        },
      ];
    } catch {
      return [];
    }
  });
}

async function loadCollections(
  url: string,
  signal?: AbortSignal
): Promise<GISStacCollection[]> {
  const result: GISStacCollection[] = [];
  const visited = new Set<string>();
  let next: string | undefined = url;
  let pages = 0;

  while (next && pages < 30 && !visited.has(next)) {
    visited.add(next);
    pages += 1;
    const pageDoc: Record<string, unknown> = await fetchJson<Record<string, unknown>>(next, { signal });
    const rawCollections = Array.isArray(pageDoc.collections)
      ? pageDoc.collections
      : [];
    for (const raw of rawCollections) {
      if (!raw || typeof raw !== "object") continue;
      const collection = raw as Record<string, unknown>;
      if (typeof collection.id !== "string") continue;
      result.push({
        id: collection.id,
        title:
          typeof collection.title === "string" ? collection.title : undefined,
        description:
          typeof collection.description === "string"
            ? collection.description
            : undefined,
      });
    }
    next = links(pageDoc.links, next).find((link) => link.rel === "next")?.href;
  }

  return Array.from(
    new Map(result.map((collection) => [collection.id, collection])).values()
  ).sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
}

export async function connectStacApi(
  endpoint: string,
  signal?: AbortSignal
): Promise<GISStacConnection> {
  const parsed = new URL(endpoint);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("O STAC API deve usar HTTP ou HTTPS.");
  }

  const url = parsed.toString().replace(/\/+$/, "");
  const root = await fetchJson<Record<string, unknown>>(url, { signal });
  const rootLinks = links(root.links, url);
  const searchUrl =
    rootLinks.find((link) => link.rel === "search")?.href ??
    `${url}/search`;
  const collectionsUrl =
    rootLinks.find(
      (link) => link.rel === "data" || link.rel === "collections"
    )?.href ?? `${url}/collections`;

  let collections: GISStacCollection[] = [];
  try {
    collections = await loadCollections(collectionsUrl, signal);
  } catch {
    // A STAC Item Search endpoint can still be useful when collection listing
    // is unavailable. Search UI will allow an explicit collection id.
  }

  return {
    url,
    title:
      typeof root.title === "string"
        ? root.title
        : typeof root.id === "string"
          ? root.id
          : "STAC API",
    description:
      typeof root.description === "string" ? root.description : undefined,
    searchUrl,
    collections,
  };
}

function normalizeAsset(
  key: string,
  raw: RawStacAsset,
  responseUrl: string
): GISStacAsset | null {
  if (typeof raw.href !== "string") return null;
  let href: string;
  try {
    href = absoluteHttpHref(raw.href, responseUrl);
  } catch {
    return null;
  }
  return {
    key,
    href,
    title: typeof raw.title === "string" ? raw.title : undefined,
    type: typeof raw.type === "string" ? raw.type : undefined,
    roles: Array.isArray(raw.roles)
      ? raw.roles.filter((role): role is string => typeof role === "string")
      : undefined,
  };
}

function normalizeItem(
  raw: unknown,
  responseUrl: string
): GISStacItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  const rawAssets =
    item.assets && typeof item.assets === "object"
      ? (item.assets as Record<string, RawStacAsset>)
      : {};
  const assets = Object.entries(rawAssets)
    .map(([key, asset]) => normalizeAsset(key, asset, responseUrl))
    .filter((asset): asset is GISStacAsset => Boolean(asset));

  return {
    id: item.id,
    collection:
      typeof item.collection === "string" ? item.collection : undefined,
    bbox: Array.isArray(item.bbox)
      ? item.bbox.filter((value): value is number => typeof value === "number")
      : undefined,
    properties:
      item.properties && typeof item.properties === "object"
        ? (item.properties as Record<string, unknown>)
        : {},
    assets,
  };
}

function parseSearchResult(
  raw: unknown,
  responseUrl: string
): GISStacItem[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("O STAC devolveu uma resposta de pesquisa inválida.");
  }
  const features = Array.isArray((raw as any).features)
    ? (raw as any).features
    : [];
  return features
    .map((item: unknown) => normalizeItem(item, responseUrl))
    .filter((item: GISStacItem | null): item is GISStacItem => Boolean(item));
}

export async function searchStacItems(
  connection: GISStacConnection,
  options: {
    collection?: string;
    bbox?: [number, number, number, number];
    datetime?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {}
): Promise<GISStacItem[]> {
  const body: Record<string, unknown> = {
    limit: Math.max(1, Math.min(options.limit ?? 20, 100)),
  };
  if (options.collection) body.collections = [options.collection];
  if (options.bbox) body.bbox = options.bbox;
  if (options.datetime) body.datetime = options.datetime;

  try {
    const raw = await fetchJson<unknown>(connection.searchUrl, {
      signal: options.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return parseSearchResult(raw, connection.searchUrl);
  } catch (postError) {
    const url = new URL(connection.searchUrl);
    url.searchParams.set("limit", String(body.limit));
    if (options.collection) {
      url.searchParams.set("collections", options.collection);
    }
    if (options.bbox) url.searchParams.set("bbox", options.bbox.join(","));
    if (options.datetime) url.searchParams.set("datetime", options.datetime);
    try {
      const raw = await fetchJson<unknown>(url.toString(), {
        signal: options.signal,
      });
      return parseSearchResult(raw, url.toString());
    } catch {
      throw postError;
    }
  }
}

function assetPath(asset: GISStacAsset): string {
  try {
    return new URL(asset.href).pathname.toLowerCase();
  } catch {
    return asset.href.toLowerCase();
  }
}

export function isStacRasterAsset(asset: GISStacAsset): boolean {
  const type = (asset.type ?? "").toLowerCase();
  const path = assetPath(asset);
  if (/\.tiff?(?:$|[?#])/.test(path)) return true;
  return (
    type.includes("geotiff") ||
    type.includes("image/tiff") ||
    type.includes("cloud-optimized")
  );
}

export function stacRasterAssets(item: GISStacItem): GISStacAsset[] {
  const rasters = item.assets.filter(isStacRasterAsset);
  return rasters.sort((a, b) => {
    const score = (asset: GISStacAsset) => {
      const roles = asset.roles ?? [];
      let value = 0;
      if (roles.includes("visual")) value += 3;
      if (roles.includes("data")) value += 2;
      if ((asset.type ?? "").toLowerCase().includes("cloud-optimized")) value += 3;
      return value;
    };
    return score(b) - score(a) || a.key.localeCompare(b.key);
  });
}

function isPlanetaryComputerCatalog(catalogUrl: string): boolean {
  try {
    return new URL(catalogUrl).hostname.toLowerCase() === PLANETARY_COMPUTER_HOST;
  } catch {
    return false;
  }
}

function isAzureBlob(href: string): boolean {
  try {
    return new URL(href).hostname.toLowerCase().endsWith(".blob.core.windows.net");
  } catch {
    return false;
  }
}

async function signPlanetaryComputerAsset(href: string): Promise<string> {
  const cached = signedCache.get(href);
  if (cached && cached.expiresAt - Date.now() > SIGNING_EXPIRY_BUFFER_MS) {
    return cached.href;
  }
  const pending = pendingSigned.get(href);
  if (pending) return pending;

  const request = (async () => {
    const endpoint = new URL(PLANETARY_COMPUTER_SIGN_URL);
    endpoint.searchParams.set("href", href);
    const data = await fetchJson<Record<string, unknown>>(endpoint.toString());
    if (typeof data.href !== "string") {
      throw new Error("Planetary Computer devolveu uma assinatura inválida.");
    }
    const expiresAt =
      typeof data["msft:expiry"] === "string"
        ? Date.parse(data["msft:expiry"])
        : Date.now() + 10 * 60 * 1000;
    signedCache.set(href, {
      href: data.href,
      expiresAt: Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + 10 * 60 * 1000,
    });
    return data.href;
  })().finally(() => pendingSigned.delete(href));

  pendingSigned.set(href, request);
  return request;
}

export async function resolveStacAssetHref(
  source: GISStacRasterSource
): Promise<string> {
  const href = source.href;
  if (
    isPlanetaryComputerCatalog(source.catalogUrl) &&
    isAzureBlob(href)
  ) {
    try {
      return await signPlanetaryComputerAsset(href);
    } catch {
      // Some public assets remain readable unsigned. Falling back preserves
      // compatibility when the signing service is temporarily unavailable.
      return href;
    }
  }
  if (!isHttpUrl(href)) {
    throw new Error("O asset STAC não possui um URL HTTP/HTTPS legível pelo browser.");
  }
  return href;
}

export function stacItemDate(item: GISStacItem): string {
  const value =
    item.properties.datetime ??
    item.properties.start_datetime ??
    item.properties.end_datetime;
  return typeof value === "string" ? value : "";
}

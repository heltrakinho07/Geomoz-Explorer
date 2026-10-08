/**
 * OGC API - Features client for GeoMoz.
 *
 * Accepts a landing page, /collections endpoint, collection URL or /items URL,
 * discovers collections, and imports GeoJSON features while following rel=next.
 */

import type { Feature, FeatureCollection } from "geojson";

export interface OgcApiFeatureCollection {
  id: string;
  title: string;
  description?: string;
  itemsUrl: string;
}

export interface OgcApiFeaturesConnection {
  url: string;
  title: string;
  collections: OgcApiFeatureCollection[];
  focusCollection?: string;
}

interface OgcLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
}

function links(value: unknown, base: string): OgcLink[] {
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
          title: typeof raw.title === "string" ? raw.title : undefined,
        },
      ];
    } catch {
      return [];
    }
  });
}

async function fetchJson<T>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/geo+json,application/json,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`OGC API request falhou: HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

function collectionFromDocument(
  raw: Record<string, unknown>,
  base: string
): OgcApiFeatureCollection | null {
  if (typeof raw.id !== "string") return null;
  const collectionLinks = links(raw.links, base);
  const itemsUrl =
    collectionLinks.find(
      (link) =>
        link.rel === "items" ||
        (link.rel === "data" && link.href.includes("/items"))
    )?.href ??
    `${base.replace(/\/+$/, "")}/items`;
  return {
    id: raw.id,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : raw.id,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    itemsUrl,
  };
}

function inferBaseAndFocus(urlValue: string): {
  requestUrl: string;
  focusCollection?: string;
} {
  const url = new URL(urlValue);
  const parts = url.pathname.split("/").filter(Boolean);
  const collectionsIndex = parts.findIndex(
    (part) => part.toLowerCase() === "collections"
  );
  if (collectionsIndex >= 0 && parts.length > collectionsIndex + 1) {
    const collectionId = decodeURIComponent(parts[collectionsIndex + 1]);
    const baseParts = parts.slice(0, collectionsIndex);
    url.pathname = `/${baseParts.join("/")}`;
    url.search = "";
    url.hash = "";
    return {
      requestUrl: url.toString().replace(/\/$/, ""),
      focusCollection: collectionId,
    };
  }
  return { requestUrl: urlValue };
}

export async function connectOgcApiFeatures(
  urlValue: string,
  signal?: AbortSignal
): Promise<OgcApiFeaturesConnection> {
  const parsed = new URL(urlValue);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("OGC API - Features requer HTTP ou HTTPS.");
  }
  const inferred = inferBaseAndFocus(parsed.toString());
  const rootUrl = inferred.requestUrl.replace(/\/+$/, "");
  let root = await fetchJson<Record<string, unknown>>(rootUrl, signal);
  let responseUrl = rootUrl;

  // A direct /collections endpoint may already contain the list.
  let rawCollections = Array.isArray(root.collections)
    ? root.collections
    : null;

  if (!rawCollections) {
    const rootLinks = links(root.links, responseUrl);
    const collectionsUrl =
      rootLinks.find(
        (link) =>
          link.rel === "data" ||
          link.rel === "collections" ||
          link.href.replace(/\/$/, "").endsWith("/collections")
      )?.href ?? `${rootUrl}/collections`;
    const collectionsDoc = await fetchJson<Record<string, unknown>>(
      collectionsUrl,
      signal
    );
    responseUrl = collectionsUrl;
    rawCollections = Array.isArray(collectionsDoc.collections)
      ? collectionsDoc.collections
      : null;

    // A direct collection URL can be useful even when no collections list exists.
    if (!rawCollections) {
      const single = collectionFromDocument(collectionsDoc, collectionsUrl);
      if (single) rawCollections = [collectionsDoc];
    }
  }

  if (!rawCollections) {
    const single = collectionFromDocument(root, responseUrl);
    if (single) rawCollections = [root];
  }

  const collections = (rawCollections ?? [])
    .flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const collection = collectionFromDocument(
        raw as Record<string, unknown>,
        responseUrl
      );
      return collection ? [collection] : [];
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  if (!collections.length) {
    throw new Error("O endpoint não anunciou coleções OGC API - Features.");
  }

  return {
    url: rootUrl,
    title:
      typeof root.title === "string"
        ? root.title
        : "OGC API - Features",
    collections,
    focusCollection:
      inferred.focusCollection &&
      collections.some((collection) => collection.id === inferred.focusCollection)
        ? inferred.focusCollection
        : undefined,
  };
}

function normalizeFeatureCollection(raw: unknown): FeatureCollection {
  if (!raw || typeof raw !== "object") {
    throw new Error("A resposta OGC API não contém GeoJSON.");
  }
  const candidate = raw as any;
  if (
    candidate.type !== "FeatureCollection" ||
    !Array.isArray(candidate.features)
  ) {
    throw new Error("A resposta OGC API não é uma FeatureCollection.");
  }
  return candidate as FeatureCollection;
}

export async function importOgcApiFeatures(
  collection: OgcApiFeatureCollection,
  options: {
    bbox?: [number, number, number, number];
    limit?: number;
    maxFeatures?: number;
    signal?: AbortSignal;
  } = {}
): Promise<{
  geojson: FeatureCollection;
  fields: string[];
  geometryType: string;
}> {
  const maxFeatures = Math.max(1, Math.min(options.maxFeatures ?? 5000, 20_000));
  const pageLimit = Math.max(1, Math.min(options.limit ?? 1000, 10_000));
  const features: Feature[] = [];
  const visited = new Set<string>();
  let next: string | undefined;

  const first = new URL(collection.itemsUrl);
  first.searchParams.set("limit", String(pageLimit));
  if (options.bbox) first.searchParams.set("bbox", options.bbox.join(","));
  next = first.toString();

  while (next && features.length < maxFeatures && !visited.has(next)) {
    visited.add(next);
    const pageDoc: Record<string, unknown> = await fetchJson<Record<string, unknown>>(
      next,
      options.signal
    );
    const page = normalizeFeatureCollection(pageDoc);
    features.push(
      ...(page.features.slice(0, maxFeatures - features.length) as Feature[])
    );
    next = links(pageDoc.links, next).find(
      (link) => link.rel === "next"
    )?.href;
  }

  const geojson: FeatureCollection = {
    type: "FeatureCollection",
    features,
  };
  const fields = Array.from(
    new Set(
      features
        .slice(0, 500)
        .flatMap((feature) => Object.keys(feature.properties ?? {}))
    )
  );

  return {
    geojson,
    fields,
    geometryType: features[0]?.geometry?.type ?? "Geometry",
  };
}

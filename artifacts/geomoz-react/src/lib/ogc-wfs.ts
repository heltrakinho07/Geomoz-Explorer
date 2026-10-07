/**
 * GeoMoz WFS client for the GIS Workspace.
 *
 * Architecture adapted from GeoLibre's WFS source/axis-order handling (MIT):
 * https://github.com/opengeos/GeoLibre
 *
 * GeoMoz keeps its own Add Data UX and imports WFS features into the same
 * FeatureCollection layer model used by DuckDB Spatial, styling and Whitebox.
 */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export interface WfsFeatureType {
  name: string;
  title: string;
  defaultCrs?: string;
  wgs84Bounds?: [number, number, number, number] | null;
}

export interface WfsCapabilities {
  endpoint: string;
  version: string;
  featureTypes: WfsFeatureType[];
}

export interface WfsImportResult {
  name: string;
  geojson: FeatureCollection;
  featureCount: number;
  geometryType: string;
  fields: string[];
  version: string;
  typeName: string;
}

const OPERATION_PARAMS = new Set([
  "service",
  "request",
  "version",
  "typename",
  "typenames",
  "outputformat",
  "srsname",
  "count",
  "maxfeatures",
  "bbox",
  "resulttype",
  "startindex",
]);

function localName(node: Element): string {
  return (node.localName || node.nodeName).replace(/^.*:/, "");
}

function childElements(element: Element): Element[] {
  return Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1
  );
}

function descendants(root: Element | null, name: string): Element[] {
  const found: Element[] = [];
  const stack = root ? [root] : [];
  while (stack.length > 0) {
    const element = stack.pop()!;
    if (localName(element) === name) found.push(element);
    stack.push(...childElements(element).reverse());
  }
  return found;
}

function child(element: Element, name: string): Element | undefined {
  return childElements(element).find((candidate) => localName(candidate) === name);
}

function text(element: Element | undefined): string {
  return element?.textContent?.trim() ?? "";
}

function normalizeVersion(value: string): string {
  if (value.startsWith("2")) return "2.0.0";
  if (value.startsWith("1.0")) return "1.0.0";
  return "1.1.0";
}

export function stripWfsOperationParams(endpoint: string): string {
  const url = new URL(endpoint);
  for (const key of Array.from(url.searchParams.keys())) {
    if (OPERATION_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

function capabilitiesUrl(endpoint: string, version?: string): string {
  const url = new URL(stripWfsOperationParams(endpoint));
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("REQUEST", "GetCapabilities");
  if (version) url.searchParams.set("VERSION", normalizeVersion(version));
  return url.toString();
}

function parseBounds(featureType: Element): [number, number, number, number] | null {
  const wgs84 = child(featureType, "WGS84BoundingBox");
  if (wgs84) {
    const lower = text(child(wgs84, "LowerCorner")).split(/\s+/).map(Number);
    const upper = text(child(wgs84, "UpperCorner")).split(/\s+/).map(Number);
    const bounds: [number, number, number, number] = [
      lower[0],
      lower[1],
      upper[0],
      upper[1],
    ];
    if (bounds.every(Number.isFinite)) return bounds;
  }

  const latLon = child(featureType, "LatLongBoundingBox");
  if (latLon) {
    const bounds: [number, number, number, number] = [
      Number(latLon.getAttribute("minx")),
      Number(latLon.getAttribute("miny")),
      Number(latLon.getAttribute("maxx")),
      Number(latLon.getAttribute("maxy")),
    ];
    if (bounds.every(Number.isFinite)) return bounds;
  }

  return null;
}

export async function fetchWfsCapabilities(
  endpoint: string,
  options: { signal?: AbortSignal; version?: string } = {}
): Promise<WfsCapabilities> {
  const url = capabilitiesUrl(endpoint, options.version);
  const response = await fetch(url, {
    signal: options.signal,
    headers: { Accept: "application/xml,text/xml,*/*" },
  });
  if (!response.ok) {
    throw new Error(`WFS GetCapabilities falhou: HTTP ${response.status}.`);
  }

  const xml = await response.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("O servidor WFS devolveu um documento GetCapabilities inválido.");
  }

  const root = document.documentElement;
  const version = normalizeVersion(root.getAttribute("version") || options.version || "2.0.0");
  const featureTypes: WfsFeatureType[] = descendants(root, "FeatureType").flatMap(
    (featureType) => {
      const name = text(child(featureType, "Name"));
      if (!name) return [];
      const title = text(child(featureType, "Title")) || name;
      const defaultCrs =
        text(child(featureType, "DefaultCRS")) ||
        text(child(featureType, "DefaultSRS")) ||
        text(child(featureType, "SRS")) ||
        undefined;
      return [
        {
          name,
          title,
          defaultCrs,
          wgs84Bounds: parseBounds(featureType),
        },
      ];
    }
  );

  if (!featureTypes.length) {
    const exception =
      descendants(root, "ExceptionText")[0]?.textContent?.trim() ||
      descendants(root, "ServiceException")[0]?.textContent?.trim();
    throw new Error(exception || "O serviço WFS não anunciou FeatureTypes utilizáveis.");
  }

  return {
    endpoint: stripWfsOperationParams(endpoint),
    version,
    featureTypes,
  };
}

function featureUrl(params: {
  endpoint: string;
  version: string;
  typeName: string;
  maxFeatures: number;
}): string {
  const url = new URL(stripWfsOperationParams(params.endpoint));
  const version = normalizeVersion(params.version);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("VERSION", version);
  url.searchParams.set(version.startsWith("2") ? "TYPENAMES" : "TYPENAME", params.typeName);
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set(
    version.startsWith("2") ? "COUNT" : "MAXFEATURES",
    String(Math.max(1, Math.min(params.maxFeatures, 10000)))
  );
  return url.toString();
}

function normalizeFeatureCollection(value: unknown): FeatureCollection {
  const parsed = value as any;
  if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    return parsed as FeatureCollection;
  }
  if (parsed?.type === "Feature") {
    return { type: "FeatureCollection", features: [parsed as Feature] };
  }
  throw new Error("O WFS não devolveu uma coleção GeoJSON válida.");
}

type Extent = [number, number, number, number];

function forEachPosition(
  geometry: Geometry | null,
  visit: (position: Position) => void
): void {
  if (!geometry) return;
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(visit);
      return;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((line) => line.forEach(visit));
      return;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) =>
        polygon.forEach((ring) => ring.forEach(visit))
      );
      return;
    case "GeometryCollection":
      geometry.geometries.forEach((childGeometry) =>
        forEachPosition(childGeometry, visit)
      );
  }
}

function coordinateExtent(collection: FeatureCollection): Extent | null {
  const extent: Extent = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of collection.features) {
    forEachPosition(feature.geometry, ([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      extent[0] = Math.min(extent[0], x);
      extent[1] = Math.min(extent[1], y);
      extent[2] = Math.max(extent[2], x);
      extent[3] = Math.max(extent[3], y);
    });
  }
  return Number.isFinite(extent[0]) ? extent : null;
}

function validity([minX, minY, maxX, maxY]: Extent) {
  return {
    asIs:
      Math.abs(minX) <= 180 &&
      Math.abs(maxX) <= 180 &&
      Math.abs(minY) <= 90 &&
      Math.abs(maxY) <= 90,
    swapped:
      Math.abs(minX) <= 90 &&
      Math.abs(maxX) <= 90 &&
      Math.abs(minY) <= 180 &&
      Math.abs(maxY) <= 180,
  };
}

function fits(extent: Extent, bounds: Extent): boolean {
  const margin = Math.max(
    0.5,
    0.05 * Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1])
  );
  return (
    extent[0] >= bounds[0] - margin &&
    extent[1] >= bounds[1] - margin &&
    extent[2] <= bounds[2] + margin &&
    extent[3] <= bounds[3] + margin
  );
}

function shouldSwapAxes(extent: Extent, bounds?: Extent | null): boolean {
  const valid = validity(extent);
  if (valid.asIs !== valid.swapped) return valid.swapped;
  if (!valid.asIs || !bounds) return false;
  const swapped: Extent = [extent[1], extent[0], extent[3], extent[2]];
  return fits(swapped, bounds) && !fits(extent, bounds);
}

function swapAxes(collection: FeatureCollection): FeatureCollection {
  for (const feature of collection.features) {
    forEachPosition(feature.geometry, (position) => {
      const first = position[0];
      position[0] = position[1];
      position[1] = first;
    });
  }
  return collection;
}

export async function importWfsFeatureType(params: {
  endpoint: string;
  version: string;
  typeName: string;
  title?: string;
  maxFeatures?: number;
  wgs84Bounds?: [number, number, number, number] | null;
  signal?: AbortSignal;
}): Promise<WfsImportResult> {
  const version = normalizeVersion(params.version);
  const url = featureUrl({
    endpoint: params.endpoint,
    version,
    typeName: params.typeName,
    maxFeatures: params.maxFeatures ?? 5000,
  });
  const response = await fetch(url, {
    signal: params.signal,
    headers: { Accept: "application/geo+json,application/json,*/*" },
  });
  if (!response.ok) {
    throw new Error(`WFS GetFeature falhou: HTTP ${response.status}.`);
  }

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const compact = raw.replace(/\s+/g, " ").trim().slice(0, 280);
    throw new Error(
      `O WFS não devolveu GeoJSON${compact ? `: ${compact}` : "."}`
    );
  }

  const geojson = normalizeFeatureCollection(parsed);
  const extent = coordinateExtent(geojson);
  if (extent && shouldSwapAxes(extent, params.wgs84Bounds)) {
    swapAxes(geojson);
  }

  if (!geojson.features.length) {
    throw new Error("O FeatureType selecionado não devolveu feições.");
  }

  const fields = Array.from(
    new Set(
      geojson.features
        .slice(0, 500)
        .flatMap((feature) => Object.keys(feature.properties ?? {}))
    )
  );

  return {
    name: params.title || params.typeName.replace(/^.*:/, ""),
    geojson,
    featureCount: geojson.features.length,
    geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
    fields,
    version,
    typeName: params.typeName,
  };
}

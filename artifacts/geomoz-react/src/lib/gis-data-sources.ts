/**
 * Remote GIS data sources used by the GeoMoz GIS Workspace.
 *
 * Service layers are deliberately kept as project state instead of being added
 * directly to MapLibre. That makes visibility, opacity and source definitions
 * survive reloads and cloud restore.
 */

import type { Feature, FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";

export type GISWorkspaceServiceType = "xyz" | "wms" | "wmts";

export interface GISWorkspaceServiceLayer {
  id: string;
  name: string;
  type: GISWorkspaceServiceType;
  endpoint: string;
  tileUrl: string;
  visible: boolean;
  opacity: number;
  tileSize: number;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
  metadata?: {
    wmsLayer?: string;
    wmsVersion?: string;
    wmsFormat?: string;
    wmtsLayer?: string;
    tileMatrixSet?: string;
    sourceLabel?: string;
  };
}

export interface WmsLayerOption {
  name: string;
  title: string;
  abstract?: string;
  styles: Array<{ name: string; title: string }>;
}

export interface WmsCapabilities {
  endpoint: string;
  version: "1.1.1" | "1.3.0";
  title: string;
  layers: WmsLayerOption[];
}

const WMS_OPERATION_PARAMS = new Set([
  "service",
  "request",
  "version",
  "layers",
  "styles",
  "format",
  "transparent",
  "srs",
  "crs",
  "bbox",
  "width",
  "height",
]);

function xmlLocalName(node: Element): string {
  return (node.localName || node.nodeName).replace(/^.*:/, "");
}

function xmlChildren(element: Element): Element[] {
  return Array.from(element.children);
}

function xmlChild(element: Element, name: string): Element | undefined {
  return xmlChildren(element).find((child) => xmlLocalName(child) === name);
}

function xmlDescendants(root: Element | null, name: string): Element[] {
  if (!root) return [];
  const result: Element[] = [];
  const stack: Element[] = [root];
  while (stack.length) {
    const current = stack.pop()!;
    if (xmlLocalName(current) === name) result.push(current);
    stack.push(...xmlChildren(current).reverse());
  }
  return result;
}

function xmlText(element?: Element): string {
  return element?.textContent?.trim() ?? "";
}

export function stripWmsOperationParams(endpoint: string): string {
  const url = new URL(endpoint);
  for (const key of Array.from(url.searchParams.keys())) {
    if (WMS_OPERATION_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

function wmsCapabilitiesUrl(endpoint: string): string {
  const url = new URL(stripWmsOperationParams(endpoint));
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("REQUEST", "GetCapabilities");
  return url.toString();
}

function normalizeWmsVersion(value: string): "1.1.1" | "1.3.0" {
  return value.trim().startsWith("1.3") ? "1.3.0" : "1.1.1";
}

function parseWmsLayer(element: Element): WmsLayerOption | null {
  const name = xmlText(xmlChild(element, "Name"));
  if (!name) return null;
  const title = xmlText(xmlChild(element, "Title")) || name;
  const abstract = xmlText(xmlChild(element, "Abstract")) || undefined;
  const styles = xmlChildren(element)
    .filter((child) => xmlLocalName(child) === "Style")
    .flatMap((style) => {
      const styleName = xmlText(xmlChild(style, "Name"));
      if (!styleName) return [];
      return [
        {
          name: styleName,
          title: xmlText(xmlChild(style, "Title")) || styleName,
        },
      ];
    });
  return { name, title, abstract, styles };
}

export async function fetchWmsCapabilities(
  endpoint: string,
  signal?: AbortSignal
): Promise<WmsCapabilities> {
  const response = await fetch(wmsCapabilitiesUrl(endpoint), {
    signal,
    headers: { Accept: "application/xml,text/xml,*/*" },
  });
  if (!response.ok) {
    throw new Error(`WMS GetCapabilities falhou: HTTP ${response.status}.`);
  }
  const xml = await response.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("O servidor WMS devolveu XML inválido.");
  }

  const root = document.documentElement;
  const version = normalizeWmsVersion(root.getAttribute("version") || "1.1.1");
  const service = xmlDescendants(root, "Service")[0];
  const title = service ? xmlText(xmlChild(service, "Title")) : "WMS";
  const layers = xmlDescendants(root, "Layer")
    .map(parseWmsLayer)
    .filter((layer): layer is WmsLayerOption => Boolean(layer));

  if (!layers.length) {
    const exception =
      xmlDescendants(root, "ExceptionText")[0]?.textContent?.trim() ||
      xmlDescendants(root, "ServiceException")[0]?.textContent?.trim();
    throw new Error(exception || "O WMS não anunciou camadas nomeadas.");
  }

  return {
    endpoint: stripWmsOperationParams(endpoint),
    version,
    title,
    layers,
  };
}

function appendQuery(
  endpoint: string,
  params: Array<[string, string]>
): string {
  const separator = endpoint.includes("?")
    ? endpoint.endsWith("?") || endpoint.endsWith("&")
      ? ""
      : "&"
    : "?";
  const query = params
    .map(([key, value]) => {
      const encoded = value === "{bbox-epsg-3857}" ? value : encodeURIComponent(value);
      return `${encodeURIComponent(key)}=${encoded}`;
    })
    .join("&");
  return `${endpoint}${separator}${query}`;
}

export function createWmsTileUrl(options: {
  endpoint: string;
  layer: string;
  style?: string;
  format?: string;
  transparent?: boolean;
  version?: string;
  tileSize?: number;
}): string {
  const version = normalizeWmsVersion(options.version || "1.1.1");
  const tileSize = Math.max(128, Math.min(1024, options.tileSize ?? 256));
  return appendQuery(stripWmsOperationParams(options.endpoint), [
    ["SERVICE", "WMS"],
    ["REQUEST", "GetMap"],
    ["VERSION", version],
    ["LAYERS", options.layer],
    ["STYLES", options.style ?? ""],
    ["FORMAT", options.format ?? "image/png"],
    ["TRANSPARENT", options.transparent === false ? "FALSE" : "TRUE"],
    [version === "1.3.0" ? "CRS" : "SRS", "EPSG:3857"],
    ["BBOX", "{bbox-epsg-3857}"],
    ["WIDTH", String(tileSize)],
    ["HEIGHT", String(tileSize)],
  ]);
}

export function validateXyzTemplate(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Use um template HTTP ou HTTPS.");
  }
  const normalized = url.toString();
  if (
    !normalized.includes("{z}") ||
    !normalized.includes("{x}") ||
    !(normalized.includes("{y}") || normalized.includes("{-y}"))
  ) {
    throw new Error("O template XYZ/WMTS deve conter {z}, {x} e {y} (ou {-y}).");
  }
  return normalized;
}

export function createServiceLayer(input: {
  name: string;
  type: GISWorkspaceServiceType;
  endpoint: string;
  tileUrl: string;
  opacity?: number;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
  metadata?: GISWorkspaceServiceLayer["metadata"];
}): GISWorkspaceServiceLayer {
  return {
    id: `service_${crypto.randomUUID().slice(0, 12)}`,
    name: input.name.trim() || input.type.toUpperCase(),
    type: input.type,
    endpoint: input.endpoint,
    tileUrl: input.tileUrl,
    visible: true,
    opacity: Math.min(1, Math.max(0, input.opacity ?? 1)),
    tileSize: input.tileSize ?? 256,
    minZoom: input.minZoom,
    maxZoom: input.maxZoom,
    attribution: input.attribution,
    metadata: input.metadata,
  };
}

function normalizeRemoteGeoJson(value: unknown): FeatureCollection {
  const candidate = value as any;
  if (candidate?.type === "FeatureCollection" && Array.isArray(candidate.features)) {
    return candidate as FeatureCollection;
  }
  if (candidate?.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [candidate as Feature],
    };
  }
  throw new Error("O URL não devolveu GeoJSON FeatureCollection/Feature.");
}

export async function fetchRemoteGeoJson(
  urlValue: string,
  signal?: AbortSignal
): Promise<{
  name: string;
  geojson: FeatureCollection;
  fields: string[];
  geometryType: string;
}> {
  const url = new URL(urlValue);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("GeoJSON remoto requer HTTP ou HTTPS.");
  }
  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/geo+json,application/json,*/*" },
  });
  if (!response.ok) {
    throw new Error(`GeoJSON remoto falhou: HTTP ${response.status}.`);
  }
  const geojson = normalizeRemoteGeoJson(await response.json());
  const fields = Array.from(
    new Set(
      geojson.features
        .slice(0, 500)
        .flatMap((feature) => Object.keys(feature.properties ?? {}))
    )
  );
  const lastSegment =
    decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "geojson-remoto");
  return {
    name: lastSegment.replace(/\.(geo)?json$/i, "") || "GeoJSON remoto",
    geojson,
    fields,
    geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
  };
}


const SERVICE_SOURCE_PREFIX = "geomoz-remote-service-source-";
const SERVICE_LAYER_PREFIX = "geomoz-remote-service-layer-";

function safeServiceId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function serviceIds(id: string) {
  const safe = safeServiceId(id);
  return {
    source: `${SERVICE_SOURCE_PREFIX}${safe}`,
    layer: `${SERVICE_LAYER_PREFIX}${safe}`,
  };
}

/**
 * Mirrors the persisted GeoMoz remote-service store into MapLibre.
 * All service kinds are rendered as raster tiles; the semantic type is kept
 * in project state for editing, provenance and future GetFeatureInfo support.
 */
export function syncGISWorkspaceServiceLayers(
  map: MapLibreMap,
  services: GISWorkspaceServiceLayer[]
): void {
  if (!map.isStyleLoaded()) return;
  const desiredSources = new Set<string>();
  const desiredLayers = new Set<string>();

  for (const service of services) {
    const ids = serviceIds(service.id);
    desiredSources.add(ids.source);
    desiredLayers.add(ids.layer);

    if (!map.getSource(ids.source)) {
      map.addSource(ids.source, {
        type: "raster",
        tiles: [service.tileUrl],
        tileSize: service.tileSize || 256,
        minzoom: service.minZoom,
        maxzoom: service.maxZoom,
        attribution: service.attribution,
      });
    }

    if (!map.getLayer(ids.layer)) {
      map.addLayer({
        id: ids.layer,
        type: "raster",
        source: ids.source,
        layout: {
          visibility: service.visible ? "visible" : "none",
        },
        paint: {
          "raster-opacity": service.opacity,
        },
      });
    } else {
      map.setLayoutProperty(
        ids.layer,
        "visibility",
        service.visible ? "visible" : "none"
      );
      map.setPaintProperty(ids.layer, "raster-opacity", service.opacity);
    }
  }

  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    if (!layer.id.startsWith(SERVICE_LAYER_PREFIX) || desiredLayers.has(layer.id)) continue;
    if (map.getLayer(layer.id)) map.removeLayer(layer.id);
  }
  for (const sourceId of Object.keys(style.sources ?? {})) {
    if (!sourceId.startsWith(SERVICE_SOURCE_PREFIX) || desiredSources.has(sourceId)) continue;
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
}

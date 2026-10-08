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


export interface WmtsLayerOption {
  identifier: string;
  title: string;
  formats: string[];
  styles: Array<{ identifier: string; title: string; isDefault: boolean }>;
  tileMatrixSets: string[];
  resourceTemplates: Array<{ template: string; format?: string; resourceType?: string }>;
}

export interface WmtsTileMatrixSet {
  identifier: string;
  supportedCrs: string;
  matrices: string[];
}

export interface WmtsCapabilities {
  endpoint: string;
  title: string;
  version: "1.0.0";
  layers: WmtsLayerOption[];
  matrixSets: WmtsTileMatrixSet[];
}

const WMTS_OPERATION_PARAMS = new Set([
  "service",
  "request",
  "version",
  "layer",
  "style",
  "format",
  "tilematrixset",
  "tilematrix",
  "tilerow",
  "tilecol",
]);

export function stripWmtsOperationParams(endpoint: string): string {
  const url = new URL(endpoint);
  for (const key of Array.from(url.searchParams.keys())) {
    if (WMTS_OPERATION_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

function wmtsCapabilitiesUrl(endpoint: string): string {
  const url = new URL(stripWmtsOperationParams(endpoint));
  url.searchParams.set("SERVICE", "WMTS");
  url.searchParams.set("REQUEST", "GetCapabilities");
  url.searchParams.set("VERSION", "1.0.0");
  return url.toString();
}

function directChildren(element: Element, name: string): Element[] {
  return xmlChildren(element).filter((child) => xmlLocalName(child) === name);
}

function wmtsLayerFromElement(element: Element): WmtsLayerOption | null {
  const identifier = xmlText(xmlChild(element, "Identifier"));
  if (!identifier) return null;
  const styles = directChildren(element, "Style").flatMap((style) => {
    const styleId = xmlText(xmlChild(style, "Identifier"));
    if (!styleId) return [];
    return [{
      identifier: styleId,
      title: xmlText(xmlChild(style, "Title")) || styleId,
      isDefault: style.getAttribute("isDefault")?.toLowerCase() === "true",
    }];
  });
  const tileMatrixSets = directChildren(element, "TileMatrixSetLink")
    .map((link) => xmlText(xmlChild(link, "TileMatrixSet")))
    .filter(Boolean);
  const resourceTemplates = directChildren(element, "ResourceURL").flatMap((resource) => {
    const template = resource.getAttribute("template") || "";
    if (!template) return [];
    return [{
      template,
      format: resource.getAttribute("format") || undefined,
      resourceType: resource.getAttribute("resourceType") || undefined,
    }];
  });
  return {
    identifier,
    title: xmlText(xmlChild(element, "Title")) || identifier,
    formats: directChildren(element, "Format").map(xmlText).filter(Boolean),
    styles,
    tileMatrixSets,
    resourceTemplates,
  };
}

function wmtsMatrixSetFromElement(element: Element): WmtsTileMatrixSet | null {
  const identifier = xmlText(xmlChild(element, "Identifier"));
  if (!identifier) return null;
  return {
    identifier,
    supportedCrs: xmlText(xmlChild(element, "SupportedCRS")),
    matrices: directChildren(element, "TileMatrix")
      .map((matrix) => xmlText(xmlChild(matrix, "Identifier")))
      .filter(Boolean),
  };
}

export async function fetchWmtsCapabilities(
  endpoint: string,
  signal?: AbortSignal
): Promise<WmtsCapabilities> {
  const url = wmtsCapabilitiesUrl(endpoint);
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/xml,text/xml,*/*" },
  });
  if (!response.ok) {
    throw new Error(`WMTS GetCapabilities falhou: HTTP ${response.status}.`);
  }
  const xml = await response.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("O servidor WMTS devolveu XML inválido.");
  }

  const root = document.documentElement;
  const serviceIdentification = xmlDescendants(root, "ServiceIdentification")[0];
  const contents = xmlDescendants(root, "Contents")[0];
  const layers = contents
    ? directChildren(contents, "Layer")
        .map(wmtsLayerFromElement)
        .filter((layer): layer is WmtsLayerOption => Boolean(layer))
    : [];
  const matrixSets = contents
    ? directChildren(contents, "TileMatrixSet")
        .map(wmtsMatrixSetFromElement)
        .filter((set): set is WmtsTileMatrixSet => Boolean(set))
    : [];

  if (!layers.length) {
    throw new Error("O WMTS não anunciou layers utilizáveis.");
  }
  return {
    endpoint: stripWmtsOperationParams(endpoint),
    title:
      serviceIdentification
        ? xmlText(xmlChild(serviceIdentification, "Title")) || "WMTS"
        : "WMTS",
    version: "1.0.0",
    layers,
    matrixSets,
  };
}

function isWebMercatorMatrixSet(matrixSet: WmtsTileMatrixSet): boolean {
  const crs = matrixSet.supportedCrs.toLowerCase();
  return (
    crs.includes("3857") ||
    crs.includes("900913") ||
    crs.includes("googlemapscompatible") ||
    matrixSet.identifier.toLowerCase().includes("googlemapscompatible")
  );
}

function matrixTemplate(matrixSet: WmtsTileMatrixSet): string {
  if (!matrixSet.matrices.length) return "{z}";
  const parsed = matrixSet.matrices.map((identifier) => {
    const match = identifier.match(/^(.*?)(\d+)$/);
    return match ? { prefix: match[1], zoom: Number(match[2]) } : null;
  });
  if (parsed.every(Boolean)) {
    const valid = parsed as Array<{ prefix: string; zoom: number }>;
    const prefix = valid[0].prefix;
    if (
      valid.every((entry) => entry.prefix === prefix) &&
      valid.every((entry, index) => entry.zoom === index)
    ) {
      return `${prefix}{z}`;
    }
  }
  if (matrixSet.matrices.every((identifier, index) => identifier === String(index))) {
    return "{z}";
  }
  throw new Error(
    `O TileMatrixSet "${matrixSet.identifier}" usa identificadores de zoom que não podem ser convertidos automaticamente para MapLibre.`
  );
}

export function compatibleWmtsMatrixSets(
  capabilities: WmtsCapabilities,
  layer: WmtsLayerOption
): WmtsTileMatrixSet[] {
  const linked = new Set(layer.tileMatrixSets);
  const candidates = capabilities.matrixSets.filter((set) => linked.has(set.identifier));
  const mercator = candidates.filter(isWebMercatorMatrixSet);
  return mercator.length ? mercator : candidates.filter((set) => {
    try {
      matrixTemplate(set);
      return true;
    } catch {
      return false;
    }
  });
}

export function createWmtsTileUrl(options: {
  capabilities: WmtsCapabilities;
  layer: WmtsLayerOption;
  matrixSet: WmtsTileMatrixSet;
  style?: string;
  format?: string;
}): string {
  const style =
    options.style ||
    options.layer.styles.find((candidate) => candidate.isDefault)?.identifier ||
    options.layer.styles[0]?.identifier ||
    "default";
  const format = options.format || options.layer.formats[0] || "image/png";
  const matrix = matrixTemplate(options.matrixSet);

  const resource = options.layer.resourceTemplates.find(
    (candidate) =>
      (candidate.resourceType || "").toLowerCase() === "tile" &&
      (!candidate.format || candidate.format === format)
  );
  if (resource) {
    return resource.template
      .replace(/\{TileMatrixSet\}/gi, options.matrixSet.identifier)
      .replace(/\{TileMatrix\}/gi, matrix)
      .replace(/\{TileRow\}/gi, "{y}")
      .replace(/\{TileCol\}/gi, "{x}")
      .replace(/\{Style\}/gi, style);
  }

  return appendQuery(options.capabilities.endpoint, [
    ["SERVICE", "WMTS"],
    ["REQUEST", "GetTile"],
    ["VERSION", "1.0.0"],
    ["LAYER", options.layer.identifier],
    ["STYLE", style],
    ["FORMAT", format],
    ["TILEMATRIXSET", options.matrixSet.identifier],
    ["TILEMATRIX", matrix],
    ["TILEROW", "{y}"],
    ["TILECOL", "{x}"],
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

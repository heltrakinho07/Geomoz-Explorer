/**
 * GeoMoz ↔ NextGIS Web public resource catalogue adapter.
 *
 * Follows documented public REST endpoints only; private resources require an
 * independent, explicitly authorised server-side connection in a later phase.
 * The browser does not send credentials or store authentication tokens.
 *
 * Docs:
 * https://docs.nextgis.com/docs_ngweb_dev/doc/developer/resource.html
 * https://docs.nextgis.com/docs_ngweb/source/services.html
 */
import type { Feature, FeatureCollection, Geometry } from "geojson";

export type NgwResourceKind = "group" | "tile" | "vector";

export interface NgwResource {
  id: number;
  parentId: number | null;
  name: string;
  className: string;
  kind: NgwResourceKind;
  hasChildren: boolean;
}

export interface NgwTileDefinition {
  name: string;
  tiles: string[];
  sourceUrl: string;
  attribution: string;
  resourceId: number;
  instanceOrigin: string;
}

type Dict = Record<string, unknown>;

export const MAX_NGW_VECTOR_BYTES = 8 * 1024 * 1024;
export const MAX_NGW_VECTOR_FEATURES = 5000;

const VECTOR_CLASSES = new Set(["vector_layer", "postgis_layer"]);

const RENDERABLE = new Set([
  "mapserver_style",
  "qgis_vector_style",
  "raster_style",
  "wmsclient_layer",
  "webmap",
]);

function record(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict) : null;
}

function safeText(value: unknown, maxLength = 140): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function htmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeNgwOrigin(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.length > 512) throw new Error("Introduza o endereço HTTPS do servidor NextGIS Web.");
  let parsed: URL;
  try { parsed = new URL(candidate); }
  catch { throw new Error("O endereço do servidor NextGIS Web é inválido."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new Error("Utilize apenas a origem HTTPS pública do servidor, sem credenciais nem parâmetros.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      /^(?:0|10|127)\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)) {
    throw new Error("Por segurança, utilize uma origem HTTPS pública e não um endereço privado.");
  }
  return parsed.origin;
}

export function parseNgwResources(payload: unknown, parentId: number): NgwResource[] {
  if (!Array.isArray(payload)) throw new Error("O servidor NextGIS Web devolveu um catálogo inválido.");
  if (payload.length > 10000) throw new Error("O grupo contém demasiados recursos para listar nesta sessão.");
  const used = new Set<number>();
  const out: NgwResource[] = [];
  for (const item of payload) {
    const wrapper = record(item);
    const resource = record(wrapper?.resource);
    if (!resource || typeof resource.id !== "number" || !Number.isSafeInteger(resource.id) ||
        resource.id < 1 || used.has(resource.id)) continue;
    const cls = safeText(resource.cls, 80);
    const kind: NgwResourceKind | null = cls === "resource_group" ? "group" :
      RENDERABLE.has(cls) ? "tile" : VECTOR_CLASSES.has(cls) ? "vector" : null;
    if (!kind) continue;
    const name = safeText(resource.display_name);
    if (!name) continue;
    const parent = record(resource.parent);
    const candidateParent = parent?.id;
    // Defensive handling of stale or mismatched resource listings.
    if (typeof candidateParent === "number" && candidateParent !== parentId) continue;
    used.add(resource.id);
    out.push({
      id: resource.id,
      parentId,
      name,
      className: cls,
      kind,
      hasChildren: kind === "group" && resource.children === true,
    });
  }
  return out.sort((a,b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "pt") :
    a.kind === "group" ? -1 : 1));
}

export function buildNgwTileDefinition(origin: string, layer: NgwResource): NgwTileDefinition {
  const safeOrigin = normalizeNgwOrigin(origin);
  if (layer.kind !== "tile" || !RENDERABLE.has(layer.className) ||
      !Number.isSafeInteger(layer.id) || layer.id < 1) {
    throw new Error("Seleccione um estilo cartográfico ou mapa publicável.");
  }
  const url = safeOrigin +
    "/api/component/render/tile?z={z}&x={x}&y={y}&resource=" + layer.id;
  return {
    name: layer.name,
    tiles: [url],
    sourceUrl: safeOrigin + "/resource/" + layer.id,
    attribution: "&copy; " + htmlEscape(layer.name) +
      ' · <a href="' + safeOrigin + '" target="_blank" rel="noopener noreferrer">NextGIS Web</a>',
    resourceId: layer.id,
    instanceOrigin: safeOrigin,
  };
}

export async function listNgwResources(
  origin: string,
  parentId: number,
  signal?: AbortSignal,
): Promise<NgwResource[]> {
  const safeOrigin = normalizeNgwOrigin(origin);
  if (!Number.isSafeInteger(parentId) || parentId < 0) throw new Error("Grupo NextGIS Web inválido.");
  const response = await fetch(safeOrigin + "/api/resource/?parent=" + parentId, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    redirect: "error",
    headers: { Accept: "*/*" },
    signal,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Sem permissão de leitura dos recursos públicos deste servidor.");
    }
    throw new Error("Falha na consulta NextGIS Web (HTTP " + response.status + ").");
  }
  const data: unknown = await response.json();
  return parseNgwResources(data, parentId);
}


function validateNgwCoordinates(coords: unknown, depth = 0): void {
  if (!Array.isArray(coords) || coords.length === 0 || depth > 12) {
    throw new Error("A camada contém coordenadas inválidas ou demasiado complexas.");
  }
  if (typeof coords[0] === "number") {
    const x = coords[0], y = coords[1];
    if (coords.length < 2 || !Number.isFinite(x) || !Number.isFinite(y) ||
        Math.abs(x) > 180 || Math.abs(y) > 90) {
      throw new Error("A camada vectorial deve estar em EPSG:4326 (longitude/latitude).");
    }
    return;
  }
  for (const part of coords) validateNgwCoordinates(part, depth + 1);
}

function validateNgwGeometry(value: unknown, depth = 0): Geometry {
  if (depth > 12) throw new Error("Geometria demasiado aninhada para importação.");
  const g = record(value);
  if (!g || typeof g.type !== "string") throw new Error("Geometria vectorial inválida.");
  if (g.type === "GeometryCollection") {
    if (!Array.isArray(g.geometries) || g.geometries.length > MAX_NGW_VECTOR_FEATURES) {
      throw new Error("Colecção de geometrias inválida.");
    }
    for (const item of g.geometries) validateNgwGeometry(item, depth + 1);
  } else if (["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(g.type)) {
    validateNgwCoordinates(g.coordinates);
  } else {
    throw new Error("Tipo de geometria não suportado pelo GeoMoz.");
  }
  return value as Geometry;
}

export function parseNgwVectorGeoJson(value: unknown): FeatureCollection {
  const obj = record(value);
  if (!obj || obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    throw new Error("O servidor não devolveu uma colecção GeoJSON válida.");
  }
  if (obj.features.length > MAX_NGW_VECTOR_FEATURES) {
    throw new Error("A camada excede o limite de " + MAX_NGW_VECTOR_FEATURES + " feições nesta importação.");
  }
  const features: Feature[] = obj.features.map((entry: unknown): Feature => {
    const f = record(entry);
    if (!f || f.type !== "Feature") throw new Error("Feição GeoJSON inválida.");
    const properties = record(f.properties) ?? {};
    return {
      type: "Feature",
      ...(typeof f.id === "string" || typeof f.id === "number" ? { id: f.id } : {}),
      geometry: validateNgwGeometry(f.geometry),
      properties,
    } as Feature;
  });
  return { type: "FeatureCollection", features };
}

async function limitedNgwText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_NGW_VECTOR_BYTES) {
    throw new Error("O ficheiro vectorial excede o limite de 8 MB.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_NGW_VECTOR_BYTES) {
      throw new Error("O ficheiro vectorial excede o limite de 8 MB.");
    }
    return text;
  }
  const decoder = new TextDecoder();
  let output = "";
  let consumed = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      consumed += part.value.byteLength;
      if (consumed > MAX_NGW_VECTOR_BYTES) {
        throw new Error("O ficheiro vectorial excede o limite de 8 MB.");
      }
      output += decoder.decode(part.value, { stream: true });
    }
    return output + decoder.decode();
  } catch (cause) {
    await reader.cancel().catch(() => {});
    throw cause;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Export a public NGW vector or PostGIS layer as WGS84 GeoJSON for local
 * analyses and editing. Never uploads GeoMoz data or forwards credentials.
 */
export async function importNgwVector(
  origin: string, resource: NgwResource, signal?: AbortSignal,
): Promise<FeatureCollection> {
  const server = normalizeNgwOrigin(origin);
  if (resource.kind !== "vector" || !VECTOR_CLASSES.has(resource.className) ||
      !Number.isSafeInteger(resource.id) || resource.id < 1) {
    throw new Error("Seleccione uma camada vectorial NextGIS Web válida.");
  }
  const url = server + "/api/resource/" + resource.id +
    "/export?format=GeoJSON&srs=4326&zipped=False";
  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    redirect: "error",
    headers: { Accept: "application/geo+json, application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(response.status === 403 || response.status === 401
      ? "Não há autorização para exportar esta camada vectorial."
      : "Falha ao exportar camada vectorial (HTTP " + response.status + ").");
  }
  const raw = await limitedNgwText(response);
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error("A exportação do servidor não contém JSON válido."); }
  return parseNgwVectorGeoJson(data);
}

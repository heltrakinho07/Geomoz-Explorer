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
export type NgwResourceKind = "group" | "tile";

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
      RENDERABLE.has(cls) ? "tile" : null;
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

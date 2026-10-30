/**
 * GeoMoz map service configuration for locally added public XYZ/TMS and WMS.
 * Does not proxy, host or redistribute tiles. The actual tile request is made
 * by Leaflet under the provider's licence and usage restrictions.
 */
import type { QmsTileSource } from "./qms-catalog";

export type CustomMapKind = "xyz" | "tms" | "wms";

export interface CustomMapSource {
  id: string;
  kind: CustomMapKind;
  name: string;
  url: string;
  maxZoom: number;
  attribution: string;
  layers?: string;
  format?: "image/png";
  transparent?: boolean;
  version?: "1.1.1";
}

export type MapServiceSource = QmsTileSource | CustomMapSource;

export function isWmsService(source: MapServiceSource): source is CustomMapSource & { kind: "wms" } {
  return "kind" in source && source.kind === "wms";
}

export function isTmsService(source: MapServiceSource): boolean {
  return "kind" in source ? source.kind === "tms" : source.tms;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Allow only publicly addressable HTTPS hosts; credentials never enter tile requests. */
function validateUrl(template: string, tile: boolean): string {
  const url = template.trim();
  if (!url || url.length > 2048) throw new Error("Indique um endereço HTTPS válido.");
  if (tile && (!["{z}", "{x}", "{y}"].every((part) => url.includes(part)) ||
    /\{[^}]+\}/.test(url.replace(/\{[xyzs]\}/g, "")))) {
    throw new Error("XYZ/TMS exige {z}, {x} e {y} e não permite outros marcadores.");
  }
  if (!tile && /[{}]/.test(url)) throw new Error("O endereço WMS não deve conter marcadores XYZ.");
  let parsed: URL;
  try {
    parsed = new URL(tile ? url.replace(/\{[xyzs]\}/g, "0") : url);
  } catch {
    throw new Error("O endereço do serviço é inválido.");
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
    host === "localhost" || host.endsWith(".local") || host === "[::1]" ||
    /^(?:127|10|0|169\.254)\./.test(host) ||
    /^192\.168\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("O serviço exige um endereço HTTPS público, sem credenciais.");
  }
  if ([...parsed.searchParams.keys()].some((key) =>
    /^(?:key|api_?key|access_?token|token|secret|signature)$/i.test(key))) {
    throw new Error("Não insira chaves de API ou credenciais no endereço do serviço.");
  }
  return url;
}

export interface ManualServiceInput {
  kind: CustomMapKind;
  name: string;
  url: string;
  layers?: string;
  attribution?: string;
}

/** Validation is local; live remote coverage, CORS, licensing and CRS are checked when used. */
export function createManualMapService(input: ManualServiceInput): CustomMapSource {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Indique o nome da camada.");
  const url = validateUrl(input.url, input.kind !== "wms");
  const attributionText = (input.attribution ?? "").trim().slice(0, 200);
  const base: CustomMapSource = {
    id: "custom-" + Date.now().toString(36),
    kind: input.kind,
    name,
    url,
    maxZoom: 19,
    attribution: attributionText ? "&copy; " + escapeHtml(attributionText) : "",
  };
  if (input.kind === "wms") {
    const layers = (input.layers ?? "").trim();
    if (!layers || !/^[\w.:-]+(?:,[\w.:-]+)*$/.test(layers)) {
      throw new Error("Indique os identificadores das camadas WMS, separados por vírgulas.");
    }
    return { ...base, layers, format: "image/png", transparent: true, version: "1.1.1" };
  }
  return base;
}

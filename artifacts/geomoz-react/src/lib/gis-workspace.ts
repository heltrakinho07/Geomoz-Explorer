import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export type WorkspaceLayerKind = "vector" | "raster" | "service";
export type WorkspaceStyleMode = "single" | "categorized" | "graduated";

export interface WorkspaceStyle {
  mode: WorkspaceStyleMode;
  field?: string;
  color: string;
}

export interface WorkspaceLayer {
  id: string;
  name: string;
  kind: WorkspaceLayerKind;
  visible: boolean;
  opacity: number;
  source: "file" | "url" | "service";
  format: string;
  featureCount?: number;
  geojson?: FeatureCollection;
  style: WorkspaceStyle;
  createdAt: string;
}

export interface WorkspaceSelection {
  layerId: string;
  featureIndex: number;
}

export interface WorkspaceFocusRequest {
  layerId: string;
  featureIndex?: number;
  requestId: number;
}

export interface ParsedWorkspaceFile {
  name: string;
  format: string;
  geojson: FeatureCollection;
}

export const DEFAULT_WORKSPACE_STYLE: WorkspaceStyle = {
  mode: "single",
  color: "#0ea5e9",
};

export const WORKSPACE_CATEGORY_PALETTE = [
  "#0ea5e9",
  "#8b5cf6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#ec4899",
  "#6366f1",
];

export const WORKSPACE_GRADUATED_PALETTE = [
  "#e0f2fe",
  "#7dd3fc",
  "#38bdf8",
  "#0284c7",
  "#075985",
];

function asFeatureCollection(value: unknown): FeatureCollection {
  if (!value || typeof value !== "object") {
    throw new Error("Ficheiro geoespacial inválido.");
  }
  const candidate = value as { type?: string; features?: unknown[] };
  if (candidate.type === "FeatureCollection" && Array.isArray(candidate.features)) {
    return candidate as FeatureCollection;
  }
  if (candidate.type === "Feature") {
    return { type: "FeatureCollection", features: [candidate as Feature] };
  }
  if (typeof candidate.type === "string" && "coordinates" in (candidate as object)) {
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: candidate as Geometry }],
    };
  }
  throw new Error("GeoJSON deve ser FeatureCollection, Feature ou Geometry.");
}

function parseCsv(text: string): FeatureCollection {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) throw new Error("CSV sem registos.");
  const headers = rows[0].split(",").map((v) => v.trim());
  const latIndex = headers.findIndex((h) => /^(lat|latitude)$/i.test(h));
  const lonIndex = headers.findIndex((h) => /^(lon|lng|longitude)$/i.test(h));
  if (latIndex < 0 || lonIndex < 0) {
    throw new Error("CSV requer colunas latitude/longitude (ou lat/lon/lng).");
  }

  const features: Feature[] = [];
  rows.slice(1).forEach((row, index) => {
    if (!row.trim()) return;
    const cells = row.split(",").map((v) => v.trim());
    const lat = Number(cells[latIndex]);
    const lon = Number(cells[lonIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const properties: GeoJsonProperties = {};
    headers.forEach((header, i) => {
      if (i !== latIndex && i !== lonIndex) properties[header] = cells[i] ?? "";
    });
    features.push({
      type: "Feature",
      id: index,
      properties,
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  });
  if (!features.length) throw new Error("CSV não contém coordenadas válidas.");
  return { type: "FeatureCollection", features };
}

export async function parseWorkspaceFile(file: File): Promise<ParsedWorkspaceFile> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const text = await file.text();

  if (extension === "geojson" || extension === "json") {
    return {
      name: file.name.replace(/\.[^.]+$/, ""),
      format: "GeoJSON",
      geojson: asFeatureCollection(JSON.parse(text)),
    };
  }
  if (extension === "csv") {
    return {
      name: file.name.replace(/\.[^.]+$/, ""),
      format: "CSV",
      geojson: parseCsv(text),
    };
  }

  throw new Error(
    "Nesta primeira fase use GeoJSON/JSON ou CSV. Shapefile, GeoPackage, KML e rasters entram no próximo adaptador."
  );
}

export function workspaceColumns(layer: WorkspaceLayer): string[] {
  if (!layer.geojson) return [];
  const keys = new Set<string>();
  layer.geojson.features.slice(0, 500).forEach((feature) => {
    Object.keys(feature.properties ?? {}).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
}

export function workspaceNumericColumns(layer: WorkspaceLayer): string[] {
  if (!layer.geojson) return [];
  return workspaceColumns(layer).filter((key) =>
    layer.geojson!.features.some((feature) => {
      const value = Number(feature.properties?.[key]);
      return Number.isFinite(value);
    })
  );
}

export function workspaceNumericRange(
  layer: WorkspaceLayer,
  field?: string
): [number, number] | null {
  if (!layer.geojson || !field) return null;
  const values = layer.geojson.features
    .map((feature) => Number(feature.properties?.[field]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function workspaceFeatureColor(
  layer: WorkspaceLayer,
  feature: Feature,
  numericRange?: [number, number] | null
): string {
  if (layer.style.mode === "single" || !layer.style.field) {
    return layer.style.color;
  }

  const raw = feature.properties?.[layer.style.field];
  if (layer.style.mode === "categorized") {
    const index = hashString(String(raw ?? "Sem valor")) % WORKSPACE_CATEGORY_PALETTE.length;
    return WORKSPACE_CATEGORY_PALETTE[index];
  }

  const numeric = Number(raw);
  const range = numericRange ?? workspaceNumericRange(layer, layer.style.field);
  if (!Number.isFinite(numeric) || !range) return "#94a3b8";
  const [min, max] = range;
  if (max <= min) return WORKSPACE_GRADUATED_PALETTE[2];
  const normalized = Math.max(0, Math.min(0.999, (numeric - min) / (max - min)));
  const index = Math.floor(normalized * WORKSPACE_GRADUATED_PALETTE.length);
  return WORKSPACE_GRADUATED_PALETTE[index];
}

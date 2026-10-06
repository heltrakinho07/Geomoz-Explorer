import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export type WorkspaceLayerKind = "vector" | "raster" | "service";

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
  createdAt: string;
}

export interface ParsedWorkspaceFile {
  name: string;
  format: string;
  geojson: FeatureCollection;
}

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
    return { name: file.name.replace(/\.[^.]+$/, ""), format: "GeoJSON", geojson: asFeatureCollection(JSON.parse(text)) };
  }
  if (extension === "csv") {
    return { name: file.name.replace(/\.[^.]+$/, ""), format: "CSV", geojson: parseCsv(text) };
  }

  throw new Error("Nesta primeira fase use GeoJSON/JSON ou CSV. Shapefile, GeoPackage, KML e rasters entram no próximo adaptador.");
}

export function workspaceColumns(layer: WorkspaceLayer): string[] {
  if (!layer.geojson) return [];
  const keys = new Set<string>();
  layer.geojson.features.slice(0, 500).forEach((feature) => {
    Object.keys(feature.properties ?? {}).forEach((key) => keys.add(key));
  });
  return Array.from(keys);
}

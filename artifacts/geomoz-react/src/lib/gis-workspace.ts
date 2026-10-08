import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

/** Local-only GIS workspace. Files are parsed in the browser, never uploaded. */
export const MAX_WORKSPACE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_WORKSPACE_FEATURES = 5000;

export interface WorkspaceLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  format: "GeoJSON" | "CSV";
  featureCount: number;
  geojson: FeatureCollection;
  createdAt: string;
}

export interface ParsedWorkspaceFile {
  name: string;
  format: WorkspaceLayer["format"];
  geojson: FeatureCollection;
}

function validateCoordinates(value: unknown, depth = 0): void {
  if (depth > 12 || !Array.isArray(value) || value.length === 0) {
    throw new Error("Coordenadas GeoJSON inválidas ou demasiadamente aninhadas.");
  }
  if (typeof value[0] === "number") {
    if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
      throw new Error("Coordenadas GeoJSON não finitas ou incompletas.");
    }
    // GeoJSON is WGS84 longitude/latitude (RFC 7946).
    if (Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) {
      throw new Error("As coordenadas devem estar em WGS84 (longitude/latitude).");
    }
    return;
  }
  value.forEach((part) => validateCoordinates(part, depth + 1));
}

function validateGeometry(value: unknown): Geometry {
  if (!value || typeof value !== "object") {
    throw new Error("Feição sem geometria válida.");
  }
  const geometry = value as { type?: string; coordinates?: unknown; geometries?: unknown };
  const supported = new Set(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]);
  if (geometry.type === "GeometryCollection") {
    if (!Array.isArray(geometry.geometries) || geometry.geometries.length > MAX_WORKSPACE_FEATURES) {
      throw new Error("Colecção de geometrias inválida.");
    }
    geometry.geometries.forEach((item) => validateGeometry(item));
    return value as Geometry;
  }
  if (!geometry.type || !supported.has(geometry.type)) {
    throw new Error("Tipo de geometria GeoJSON não suportado.");
  }
  validateCoordinates(geometry.coordinates);
  return value as Geometry;
}

function validateFeature(value: unknown): Feature {
  if (!value || typeof value !== "object" || (value as { type?: string }).type !== "Feature") {
    throw new Error("A colecção contém um elemento que não é uma feição GeoJSON.");
  }
  const item = value as { geometry?: unknown; properties?: unknown; id?: string | number };
  const geometry = validateGeometry(item.geometry);
  const props = item.properties && typeof item.properties === "object" && !Array.isArray(item.properties)
    ? item.properties as GeoJsonProperties : {};
  return { type: "Feature", id: item.id, geometry, properties: props };
}

export function normalizeWorkspaceGeoJSON(value: unknown): FeatureCollection {
  if (!value || typeof value !== "object") throw new Error("GeoJSON inválido.");
  const candidate = value as { type?: string; features?: unknown[] };
  let features: Feature[];
  if (candidate.type === "FeatureCollection") {
    if (!Array.isArray(candidate.features)) throw new Error("A colecção GeoJSON não contém feições.");
    if (candidate.features.length > MAX_WORKSPACE_FEATURES) {
      throw new Error(`Máximo de ${MAX_WORKSPACE_FEATURES} feições por ficheiro.`);
    }
    features = candidate.features.map(validateFeature);
  } else if (candidate.type === "Feature") {
    features = [validateFeature(value)];
  } else {
    features = [{ type: "Feature", properties: {}, geometry: validateGeometry(value) }];
  }
  if (features.length === 0) throw new Error("O GeoJSON não contém feições.");
  return { type: "FeatureCollection", features };
}

function delimiterFor(csv: string): string {
  const first = csv.split(/\r?\n/, 1)[0] || "";
  const options = [",", ";", "\t"];
  return options.sort((a, b) => first.split(b).length - first.split(a).length)[0];
}

/** RFC4180-style quoting with support for ; and tab-delimited exports. */
function csvRows(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(value.trim()); value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      if (rows.length > MAX_WORKSPACE_FEATURES + 1) {
        throw new Error(`Máximo de ${MAX_WORKSPACE_FEATURES} registos CSV.`);
      }
    } else value += char;
  }
  if (quoted) throw new Error("CSV com aspas por fechar.");
  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function parseWorkspaceText(filename: string, rawText: string): ParsedWorkspaceFile {
  if (rawText.length > MAX_WORKSPACE_FILE_BYTES) throw new Error("Ficheiro muito grande (máximo 8 MB).");
  const extension = filename.split(".").pop()?.toLowerCase();
  const name = filename.replace(/\.[^.]+$/, "").slice(0, 100) || "Nova camada";
  if (extension === "geojson" || extension === "json") {
    let value: unknown;
    try { value = JSON.parse(rawText); }
    catch { throw new Error("Não foi possível ler o JSON. Verifique a sintaxe."); }
    return { name, format: "GeoJSON", geojson: normalizeWorkspaceGeoJSON(value) };
  }
  if (extension !== "csv") {
    throw new Error("Formatos suportados nesta fase: GeoJSON/JSON e CSV.");
  }
  const data = csvRows(rawText.replace(/^\uFEFF/, ""), delimiterFor(rawText));
  if (data.length < 2) throw new Error("CSV sem registos.");
  const [headers, ...records] = data;
  const latIndex = headers.findIndex((key) => /^(lat|latitude)$/i.test(key));
  const lonIndex = headers.findIndex((key) => /^(lon|lng|longitude)$/i.test(key));
  if (latIndex < 0 || lonIndex < 0) throw new Error("CSV exige colunas latitude e longitude.");
  const features: Feature[] = [];
  records.forEach((cells, index) => {
    const latText = cells[latIndex], lonText = cells[lonIndex];
    if (!latText || !lonText) return;
    const lat = Number(latText), lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    const properties: GeoJsonProperties = {};
    headers.forEach((header, column) => {
      if (column !== latIndex && column !== lonIndex && header) properties[header] = cells[column] ?? "";
    });
    features.push({
      type: "Feature", id: index, properties, geometry: { type: "Point", coordinates: [lon, lat] },
    });
  });
  if (features.length === 0) throw new Error("Nenhuma coordenada WGS84 válida encontrada no CSV.");
  return { name, format: "CSV", geojson: { type: "FeatureCollection", features } };
}

export async function parseWorkspaceFile(file: File): Promise<ParsedWorkspaceFile> {
  if (file.size > MAX_WORKSPACE_FILE_BYTES) {
    throw new Error(`${file.name}: excede o limite de 8 MB.`);
  }
  return parseWorkspaceText(file.name, await file.text());
}

export function workspaceColumns(layer: WorkspaceLayer): string[] {
  const columns = new Set<string>();
  layer.geojson.features.slice(0, 500).forEach((f) => {
    Object.keys(f.properties ?? {}).forEach((key) => columns.add(key));
  });
  return [...columns].slice(0, 100);
}

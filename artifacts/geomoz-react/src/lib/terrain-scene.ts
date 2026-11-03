import type { TerrainMeshData, TerrainVisualStyle } from "./terrain-webgl";

export const TERRAIN_SCENE_VERSION = 1;
export const MAX_TERRAIN_SCENE_BYTES = 4 * 1024 * 1024;

export interface TerrainScene {
  format: "geomoz-terrain-scene";
  version: typeof TERRAIN_SCENE_VERSION;
  createdAt: string;
  terrain: TerrainMeshData;
  style: Exclude<TerrainVisualStyle, "imagery">;
  exaggeration: number;
  note: string;
}

export function validateTerrainMesh(value: unknown): TerrainMeshData {
  if (!value || typeof value !== "object") throw new Error("Cena sem DEM válido.");
  const data = value as Partial<TerrainMeshData>;
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height)
      || !data.width || !data.height || data.width < 2 || data.height < 2
      || data.width > 255 || data.height > 255
      || !Array.isArray(data.heights) || data.heights.length !== data.width * data.height
      || data.heights.some(v => v !== null && (typeof v !== "number" || !Number.isFinite(v)))) {
    throw new Error("A grelha de elevações é inválida.");
  }
  if (!Array.isArray(data.boundsMeters) || data.boundsMeters.length !== 4
      || data.boundsMeters.some(v => typeof v !== "number" || !Number.isFinite(v))
      || data.boundsMeters[2] <= data.boundsMeters[0]
      || data.boundsMeters[3] <= data.boundsMeters[1]
      || !Array.isArray(data.bounds4326) || data.bounds4326.length !== 4
      || data.bounds4326.some(v => typeof v !== "number" || !Number.isFinite(v))
      || typeof data.crs !== "string" || !/^EPSG:(?:32[67]\d{2}|3857)$/.test(data.crs)) {
    throw new Error("A projecção ou extensão do terreno é inválida.");
  }
  for (const key of ["minElevation", "maxElevation", "meanElevation", "validFraction"] as const) {
    if (!Number.isFinite(data[key])) throw new Error("Estatísticas do DEM inválidas.");
  }
  if (data.maxElevation! < data.minElevation!
      || data.validFraction! < 0 || data.validFraction! > 1
      || data.heights.every(v => v === null)) {
    throw new Error("O DEM não contém elevações válidas.");
  }
  if (typeof data.name !== "string" || data.name.length > 300
      || typeof data.sourceCrs !== "string") {
    throw new Error("Metadados do DEM inválidos.");
  }
  return data as TerrainMeshData;
}

export function encodeTerrainScene(terrain: TerrainMeshData, style: TerrainVisualStyle,
  exaggeration: number): string {
  validateTerrainMesh(terrain);
  if (!Number.isFinite(exaggeration) || exaggeration < 1 || exaggeration > 15) {
    throw new Error("Exagero vertical inválido.");
  }
  const scene: TerrainScene = {
    format: "geomoz-terrain-scene",
    version: TERRAIN_SCENE_VERSION,
    createdAt: new Date().toISOString(),
    terrain,
    style: style === "grayscale" ? "grayscale" : "hypsometric",
    exaggeration,
    note: "Contém apenas uma pré-visualização reamostrada; não substitui o DEM original. Texturas externas não são incorporadas.",
  };
  return JSON.stringify(scene);
}

export function decodeTerrainScene(raw: string): TerrainScene {
  if (new Blob([raw]).size > MAX_TERRAIN_SCENE_BYTES) {
    throw new Error("A cena ultrapassa o limite de 4 MB.");
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Ficheiro .geomoz não contém JSON válido."); }
  if (!value || typeof value !== "object") throw new Error("Ficheiro .geomoz inválido.");
  const candidate = value as Partial<TerrainScene>;
  if (candidate.format !== "geomoz-terrain-scene"
      || candidate.version !== TERRAIN_SCENE_VERSION
      || (candidate.style !== "hypsometric" && candidate.style !== "grayscale")
      || typeof candidate.exaggeration !== "number"
      || !Number.isFinite(candidate.exaggeration) || candidate.exaggeration < 1
      || candidate.exaggeration > 15) {
    throw new Error("Formato de cena GeoMoz 3D não suportado.");
  }
  return { ...(candidate as TerrainScene), terrain: validateTerrainMesh(candidate.terrain) };
}

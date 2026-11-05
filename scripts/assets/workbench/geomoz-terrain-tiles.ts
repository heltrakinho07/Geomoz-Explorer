/**
 * GeoMoz native DEM -> on-demand, georeferenced MapLibre Terrarium tiles.
 *
 * No server upload, external terrain provider or assumed geographic location.
 * Numeric data stays in memory, scoped to the currently loaded project DEM.
 * The 3D map is a *preview*; missing/outside cells are represented by flat
 * reference terrain and must never be used as valid elevation measurements.
 */
import proj4 from "proj4";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";

export const GEOMOZ_TERRAIN_TILE_SIZE = 256;

export function validTerrainGeography(terrain: TerrainMeshData): boolean {
  if (!Array.isArray(terrain.bounds4326) || terrain.bounds4326.length !== 4 ||
      !Array.isArray(terrain.boundsMeters) || terrain.boundsMeters.length !== 4) return false;
  const [west, south, east, north] = terrain.bounds4326;
  const [left, bottom, right, top] = terrain.boundsMeters;
  return [west, south, east, north, left, bottom, right, top].every(Number.isFinite) &&
    west >= -180 && east <= 180 && west < east &&
    south > -85.051129 && north < 85.051129 && south < north &&
    left < right && bottom < top &&
    Number.isInteger(terrain.width) && Number.isInteger(terrain.height) &&
    terrain.width >= 2 && terrain.height >= 2 &&
    terrain.heights.length === terrain.width * terrain.height &&
    /^(EPSG:3857|EPSG:32[67]\d{2})$/.test(terrain.crs);
}

export function terrainProjection(terrain: TerrainMeshData): (lon: number, lat: number) => [number, number] {
  if (!validTerrainGeography(terrain)) throw Error("O DEM não possui extensão e CRS geográficos válidos.");
  const match = /^EPSG:(326|327)(\d{2})$/.exec(terrain.crs);
  if (match) {
    const zone = Number(match[2]);
    if (zone < 1 || zone > 60) throw Error("Zona UTM inválida no DEM.");
    if (!proj4.defs(terrain.crs)) {
      proj4.defs(terrain.crs,
        "+proj=utm +zone=" + zone + (match[1] === "327" ? " +south" : "") +
        " +datum=WGS84 +units=m +no_defs");
    }
  }
  return (lon, lat) => proj4("EPSG:4326", terrain.crs, [lon, lat]) as [number, number];
}

/** Strict bilinear interpolation: any NoData neighbour means no sample. */
export function sampleGeoTerrain(
  terrain: TerrainMeshData,
  xy: readonly [number, number]
): number | null {
  const [left, bottom, right, top] = terrain.boundsMeters;
  const u = (xy[0] - left) / (right - left) * (terrain.width - 1);
  const v = (top - xy[1]) / (top - bottom) * (terrain.height - 1);
  if (![u, v].every(Number.isFinite) || u < 0 || v < 0 ||
      u > terrain.width - 1 || v > terrain.height - 1) return null;
  const c0 = Math.floor(u), r0 = Math.floor(v);
  const c1 = Math.min(c0 + 1, terrain.width - 1);
  const r1 = Math.min(r0 + 1, terrain.height - 1);
  const a = terrain.heights[r0 * terrain.width + c0];
  const b = terrain.heights[r0 * terrain.width + c1];
  const c = terrain.heights[r1 * terrain.width + c0];
  const d = terrain.heights[r1 * terrain.width + c1];
  if (![a, b, c, d].every((h) => typeof h === "number" && Number.isFinite(h))) return null;
  const fx = u - c0, fy = v - r0;
  return (a! * (1 - fx) + b! * fx) * (1 - fy) +
    (c! * (1 - fx) + d! * fx) * fy;
}

/** Terrarium: height (m) = R*256 + G + B/256 - 32768. */
export function encodeTerrariumElevation(height: number): [number, number, number] {
  const shifted = Math.max(0, Math.min(65535.99609375, height + 32768));
  const whole = Math.floor(shifted);
  return [Math.floor(whole / 256), whole % 256, Math.min(255, Math.round((shifted - whole) * 256))];
}

function tileLongitude(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tileLatitude(y: number, z: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / Math.pow(2, z)))) * 180 / Math.PI;
}

export function terrainRecommendedMaxZoom(terrain: TerrainMeshData): number {
  const centerLat = (terrain.bounds4326[1] + terrain.bounds4326[3]) / 2;
  const metersPerCell = Math.max(
    (terrain.boundsMeters[2] - terrain.boundsMeters[0]) / Math.max(1, terrain.width - 1),
    (terrain.boundsMeters[3] - terrain.boundsMeters[1]) / Math.max(1, terrain.height - 1), 1
  );
  return Math.max(8, Math.min(14,
    Math.ceil(Math.log2(156543.03392 * Math.cos(centerLat * Math.PI / 180) / metersPerCell))));
}

/**
 * Generate one 256x256 geographic elevation tile on request. A zero-height
 * reference is used outside the DEM because raster-dem has no alpha/NoData.
 * The DEM footprint is shown separately to prevent false geographic claims.
 */
export async function terrainTerrariumPng(
  terrain: TerrainMeshData,
  project: (lon: number, lat: number) => [number, number],
  z: number, x: number, y: number
): Promise<ArrayBuffer> {
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22 ||
      x < 0 || y < 0 || x >= Math.pow(2, z) || y >= Math.pow(2, z)) {
    throw Error("Coordenadas de tile inválidas.");
  }
  const size = GEOMOZ_TERRAIN_TILE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw Error("Não foi possível criar a imagem de terreno.");
  const pixels = ctx.createImageData(size, size);
  const coords = terrain.bounds4326;
  const lonStart = tileLongitude(x, z);
  const lonEnd = tileLongitude(x + 1, z);
  const latStart = tileLatitude(y, z);
  const latEnd = tileLatitude(y + 1, z);
  const overlaps = lonEnd >= coords[0] && lonStart <= coords[2] &&
    latStart >= coords[1] && latEnd <= coords[3];
  // Initialize outside/NoData to a clearly identified flat reference (0 m).
  const flat = encodeTerrariumElevation(0);
  for (let row = 0; row < size; row++) {
    const latitude = tileLatitude(y + (row + 0.5) / size, z);
    for (let col = 0; col < size; col++) {
      let height: number | null = null;
      if (overlaps) {
        const longitude = tileLongitude(x + (col + 0.5) / size, z);
        if (longitude >= coords[0] && longitude <= coords[2] &&
            latitude >= coords[1] && latitude <= coords[3]) {
          height = sampleGeoTerrain(terrain, project(longitude, latitude));
        }
      }
      const rgb = height === null ? flat : encodeTerrariumElevation(height);
      const k = (row * size + col) * 4;
      pixels.data[k] = rgb[0];
      pixels.data[k + 1] = rgb[1];
      pixels.data[k + 2] = rgb[2];
      pixels.data[k + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(Error("A imagem DEM não foi codificada.")), "image/png");
  });
  return blob.arrayBuffer();
}

/**
 * GeoMoz native DEM -> on-demand, georeferenced MapLibre Terrarium tiles.
 *
 * No server upload, external terrain provider or assumed geographic location.
 * Numeric data stays in memory, scoped to the currently loaded project DEM.
 * The 3D map is a *preview*; missing/outside cells are represented by flat
 * reference terrain and must never be used as valid elevation measurements.
 */
import proj4 from "proj4";
import type { TerrainMeshData } from "@/lib/terrain-webgl";

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


import { describe, it, expect } from "vitest";
import {
  AWS_TERRARIUM_DEM_TILES,
  TERRAIN_SOURCE_ID,
  BASEMAP_SOURCE_ID,
  getGoogleTileUrls,
  createMapLibreStyle,
  haversineDistance,
  calculateBearing,
} from "../dem-terrain";

describe("dem-terrain module", () => {
  it("defines AWS Terrarium DEM tiles", () => {
    expect(AWS_TERRARIUM_DEM_TILES).toHaveLength(1);
    expect(AWS_TERRARIUM_DEM_TILES[0]).toContain("elevation-tiles-prod/terrarium");
  });

  it("generates Google Maps tile URLs for all basemap types", () => {
    const hybridUrls = getGoogleTileUrls("hybrid");
    expect(hybridUrls).toHaveLength(4);
    expect(hybridUrls[0]).toContain("lyrs=y");

    const satUrls = getGoogleTileUrls("satellite");
    expect(satUrls[0]).toContain("lyrs=s");

    const terrainUrls = getGoogleTileUrls("terrain");
    expect(terrainUrls[0]).toContain("lyrs=p");

    const roadUrls = getGoogleTileUrls("roadmap");
    expect(roadUrls[0]).toContain("lyrs=m");
  });

  it("creates a complete MapLibre style with terrain and sky", () => {
    const style = createMapLibreStyle("hybrid");
    expect(style.version).toBe(8);
    expect(style.sources[BASEMAP_SOURCE_ID]).toBeDefined();
    expect(style.sources[TERRAIN_SOURCE_ID]).toBeDefined();

    const terrainSource = style.sources[TERRAIN_SOURCE_ID] as any;
    expect(terrainSource.type).toBe("raster-dem");
    expect(terrainSource.encoding).toBe("terrarium");

    expect(style.layers.some((l) => l.id === "google-basemap-layer")).toBe(true);
    expect((style as any).sky).toBeDefined();
  });

  it("calculates haversine distance accurately", () => {
    // Distance between Maputo [32.58, -25.96] and Beira [34.84, -19.84] is ~715-725 km
    const maputo: [number, number] = [32.58, -25.96];
    const beira: [number, number] = [34.84, -19.84];
    const distMeters = haversineDistance(maputo, beira);
    const distKm = distMeters / 1000;

    expect(distKm).toBeGreaterThan(700);
    expect(distKm).toBeLessThan(750);
  });

  it("calculates bearing azimuth accurately", () => {
    // Due North
    const p1: [number, number] = [0, 0];
    const pNorth: [number, number] = [0, 10];
    expect(Math.round(calculateBearing(p1, pNorth))).toBe(0);

    // Due East
    const pEast: [number, number] = [10, 0];
    expect(Math.round(calculateBearing(p1, pEast))).toBe(90);
  });
});

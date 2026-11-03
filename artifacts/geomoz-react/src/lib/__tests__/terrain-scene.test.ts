import { describe, expect, it } from "vitest";
import { decodeTerrainScene, encodeTerrainScene } from "../terrain-scene";
import type { TerrainMeshData } from "../terrain-webgl";

function mesh(): TerrainMeshData {
  return {
    name: "manica_dem.tif",
    width: 3, height: 3,
    heights: [1, 3, 4, 2, null, 5, 3, 5, 6],
    boundsMeters: [650000, 7900000, 650060, 7900060],
    bounds4326: [33.2, -19, 33.21, -18.99],
    crs: "EPSG:32736",
    sourceCrs: "EPSG:32736",
    minElevation: 1, maxElevation: 6, meanElevation: 3.625,
    validFraction: 8/9, cellSizeMeters: [20,20],
    sourceWidth: 3, sourceHeight: 3,
  };
}

describe("GeoMoz terrain-scene format", () => {
  it("round-trips a preview and preserves NoData and scale metadata", () => {
    const saved = encodeTerrainScene(mesh(), "grayscale", 2.5);
    const restored = decodeTerrainScene(saved);
    expect(restored.format).toBe("geomoz-terrain-scene");
    expect(restored.terrain.heights[4]).toBeNull();
    expect(restored.terrain.boundsMeters).toEqual(mesh().boundsMeters);
    expect(restored.style).toBe("grayscale");
    expect(restored.exaggeration).toBe(2.5);
  });

  it("does not silently claim external imagery texture is embedded", () => {
    const restored = decodeTerrainScene(encodeTerrainScene(mesh(), "imagery", 1));
    expect(restored.style).toBe("hypsometric");
    expect(restored.note).toContain("não são incorporadas");
  });

  it("rejects corrupted or out-of-range terrain input", () => {
    const bad = { ...mesh(), heights: Array(9).fill(null) };
    expect(() => encodeTerrainScene(bad, "hypsometric", 1)).toThrow();
    expect(() => encodeTerrainScene(mesh(), "hypsometric", 0)).toThrow();
    expect(() => decodeTerrainScene('{"format":"other","version":1}')).toThrow();
    expect(() => decodeTerrainScene("not json")).toThrow();
  });

  it("rejects invalid CRS and nonfinite grid values", () => {
    expect(() => encodeTerrainScene({ ...mesh(), crs: "EPSG:4326" }, "grayscale", 1)).toThrow();
    expect(() => encodeTerrainScene({ ...mesh(), heights: [NaN, ...mesh().heights.slice(1)] }, "grayscale", 1)).toThrow();
  });
});

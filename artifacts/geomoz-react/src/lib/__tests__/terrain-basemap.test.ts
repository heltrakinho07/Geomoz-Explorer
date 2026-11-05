import { describe, expect, it, vi } from "vitest";
import type { Map } from "maplibre-gl";
import { BASEMAPS, satelliteTextureUrl, selectTerrainBasemap, terrainBasemapStyle } from "../terrain-basemap";

describe("Terrain 3D basemap", () => {
  it("sets provider-specific sources and credits with exactly one visible layer", () => {
    for (const key of ["satellite", "topographic", "streets"] as const) {
      const style = terrainBasemapStyle(key);
      expect(style.sources[key]).toMatchObject({
        tiles: [BASEMAPS[key].url], attribution: BASEMAPS[key].attribution,
      });
      expect(style.layers.filter(layer => "layout" in layer && layer.layout?.visibility === "visible")
        .map(layer => layer.id)).toEqual(["terrain-base-" + key]);
    }
  });

  it("switches repeatedly while tiles are loading without replacing the style", () => {
    const setLayoutProperty = vi.fn();
    const map = { getLayer: () => ({}), setLayoutProperty } as unknown as Map;
    selectTerrainBasemap(map, "topographic");
    selectTerrainBasemap(map, "streets");
    expect(setLayoutProperty.mock.calls).toEqual([
      ["terrain-base-satellite", "visibility", "none"],
      ["terrain-base-topographic", "visibility", "visible"],
      ["terrain-base-streets", "visibility", "none"],
      ["terrain-base-satellite", "visibility", "none"],
      ["terrain-base-topographic", "visibility", "none"],
      ["terrain-base-streets", "visibility", "visible"],
    ]);
  });

  it("requests a rectangular texture in the DEM's native CRS", () => {
    const query = new URL(satelliteTextureUrl([500000, 7800000, 520000, 7810000], "EPSG:32736")).searchParams;
    expect(query.get("bbox")).toBe("500000,7800000,520000,7810000");
    expect(query.get("bboxSR")).toBe("32736");
    expect(query.get("imageSR")).toBe("32736");
    expect(query.get("size")).toBe("1024,512");
  });
});

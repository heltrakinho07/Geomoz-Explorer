import { describe, expect, it } from "vitest";

import {
  GLOBAL_AOI,
  MOZAMBIQUE_MAP_BOUNDS,
  WORLD_MAP_BOUNDS,
  aoiToMapBounds,
  customAOI,
  type AreaOfInterest,
} from "@/lib/aoi";

describe("aoiToMapBounds", () => {
  it("uses padded real bounds for a drawn AOI", () => {
    const aoi = customAOI(
      {
        type: "Polygon",
        coordinates: [[
          [32.0, -26.0],
          [33.0, -26.0],
          [33.0, -25.0],
          [32.0, -25.0],
          [32.0, -26.0],
        ]],
      },
      "Área desenhada",
      "draw",
    );

    const bounds = aoiToMapBounds(aoi);

    expect(bounds.south).toBeLessThan(-26.0);
    expect(bounds.north).toBeGreaterThan(-25.0);
    expect(bounds.west).toBeLessThan(32.0);
    expect(bounds.east).toBeGreaterThan(33.0);
  });

  it("prefers explicit country/project bounds", () => {
    const aoi: AreaOfInterest = {
      source: "country",
      province: null,
      district: null,
      countryCode: "ZA",
      countryName: "South Africa",
      geometry: null,
      label: "South Africa",
      bounds: [[-35, 16], [-22, 33]],
    };

    const bounds = aoiToMapBounds(aoi);

    expect(bounds.south).toBeLessThan(-35);
    expect(bounds.north).toBeGreaterThan(-22);
    expect(bounds.west).toBeLessThan(16);
    expect(bounds.east).toBeGreaterThan(33);
  });

  it("uses world bounds for the global AOI", () => {
    expect(aoiToMapBounds(GLOBAL_AOI)).toEqual(WORLD_MAP_BOUNDS);
  });

  it("rejects invalid bounds and uses fallback", () => {
    const invalid: AreaOfInterest = {
      source: "draw",
      province: null,
      district: null,
      geometry: null,
      label: "Invalid",
      bounds: [[10, 20], [5, 15]],
    };

    expect(aoiToMapBounds(invalid)).toEqual(MOZAMBIQUE_MAP_BOUNDS);
  });
});

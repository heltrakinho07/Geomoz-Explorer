import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import {
  executeWorkspaceOperation, getWorkspaceOperation, WORKSPACE_OPERATIONS,
} from "../gis-workspace-engine";

const point = (lon: number, lat: number) =>
  ({ type: "Feature" as const, properties: {}, geometry:
    { type: "Point" as const, coordinates: [lon, lat] } });

const points: FeatureCollection = {
  type: "FeatureCollection",
  features: [point(32.58, -25.97), point(32.62, -25.98)],
};
const polygon = (coords: number[][]): FeatureCollection => ({
  type: "FeatureCollection",
  features: [{
    type: "Feature", properties: { name: "test" },
    geometry: { type: "Polygon", coordinates: [coords] },
  }],
});
const a = polygon([
  [32.5, -26.1], [32.7, -26.1], [32.7, -25.8], [32.5, -25.8], [32.5, -26.1],
]);
const b = polygon([
  [32.6, -26.2], [32.8, -26.2], [32.8, -25.9], [32.6, -25.9], [32.6, -26.2],
]);
const disjoint = polygon([
  [35, -24], [35.3, -24], [35.3, -23.8], [35, -23.8], [35, -24],
]);

describe("GeoMoz GIS real vector engine", () => {
  it("only exposes registered and executable operations", () => {
    expect(WORKSPACE_OPERATIONS.length).toBeGreaterThan(9);
    expect(getWorkspaceOperation("terrain_slope")).toBeUndefined();
    expect(() => executeWorkspaceOperation("terrain_slope" as never, points)).toThrow(/desconhecida/);
  });

  it("calculates geodetic buffer with nonzero computed area", () => {
    const output = executeWorkspaceOperation("vector_buffer", points,
      undefined, { distance: 1000, units: "meters" });
    expect(output.result.features).toHaveLength(2);
    expect(output.stats.totalAreaKm2).toBeGreaterThan(0);
    expect(output.provenance.inputFeatures).toBe(2);
    expect(output.provenance.engine).toContain("Turf");
  });

  it("calculates geometry and metrics on real coordinates", () => {
    const metrics = executeWorkspaceOperation("vector_calc_metrics", a);
    expect(metrics.result.features[0].properties?._area_km2).toBeGreaterThan(0);
    const centroids = executeWorkspaceOperation("vector_centroids", a);
    expect(centroids.result.features[0].geometry.type).toBe("Point");
    expect(executeWorkspaceOperation("vector_bbox", points).result.features[0].geometry.type)
      .toBe("Polygon");
  });

  it("computes intersection and true geometry difference", () => {
    const intersect = executeWorkspaceOperation("vector_intersect", a, b);
    expect(intersect.result.features).toHaveLength(1);
    const clipped = executeWorkspaceOperation("vector_difference", a, b);
    expect(clipped.result.features).toHaveLength(1);
    const initialArea = executeWorkspaceOperation("vector_calc_metrics", a)
      .result.features[0].properties?._area_km2;
    expect(clipped.stats.totalAreaKm2).toBeGreaterThan(0);
    expect(clipped.stats.totalAreaKm2).toBeLessThan(initialArea);
  });

  it("counts only points inside each polygon", () => {
    const output = executeWorkspaceOperation("vector_points_in_poly", a, points);
    expect(output.result.features[0].properties?._contagem_pontos).toBe(2);
  });

  it("reports valid no-overlap as an empty FeatureCollection", () => {
    const result = executeWorkspaceOperation("vector_intersect", a, disjoint);
    expect(result.result.type).toBe("FeatureCollection");
    expect(result.result.features).toHaveLength(0);
  });

  it("fails closed for mismatched geometry, missing overlay and invalid parameters", () => {
    expect(() => executeWorkspaceOperation("vector_intersect", points, a)).toThrow(/polígonos/);
    expect(() => executeWorkspaceOperation("vector_difference", a)).toThrow(/segunda camada/);
    expect(() => executeWorkspaceOperation("vector_buffer", points, undefined,
      { distance: -10 })).toThrow(/entre/);
    expect(() => executeWorkspaceOperation("vector_simplify", a, undefined,
      { tolerance: Number.NaN })).toThrow(/entre/);
    expect(() => executeWorkspaceOperation("vector_buffer", {
      type: "FeatureCollection", features: [point(500, -25)],
    })).toThrow(/WGS84/);
  });

  it("enforces a bounded number of overlay pairs in the browser", () => {
    const many = { ...a, features: Array(318).fill(a.features[0]) };
    expect(() => executeWorkspaceOperation("vector_intersect", many, many))
      .toThrow(/demasiado grande/);
  });
});

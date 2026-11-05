import { describe, expect, it } from "vitest";
import type { FeatureCollection, Geometry, Polygon, MultiPolygon } from "geojson";
import { booleanEqual } from "@turf/turf";
import reference from "./fixtures/gis-geos-reference.json";
import { executeGISVectorCommand } from "../gis-vector-engine";

function fc(...geometries: unknown[]): FeatureCollection {
  return { type: "FeatureCollection", features: geometries.map((geometry) => ({
    type: "Feature", properties: {}, geometry: geometry as Geometry,
  })) };
}
function planarArea(geometry: Geometry): number {
  const polygonArea = (rings: number[][][]) => rings.reduce((total, ring, index) => {
    const area = Math.abs(ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0)) / 2;
    return total + (index === 0 ? area : -area);
  }, 0);
  if (geometry.type === "Polygon") return polygonArea(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((s, p) => s + polygonArea(p), 0);
  throw new Error("Expected polygon");
}
describe(`Independent reference: ${reference.generator}`, () => {
  it.each([
    ["vector_intersect", "intersection"], ["vector_difference", "difference"], ["vector_dissolve", "union"],
  ] as const)("matches GEOS %s topology and Cartesian area", (command, key) => {
    const { a, b } = reference.overlay;
    const output = command === "vector_dissolve"
      ? executeGISVectorCommand(command, fc(a, b)).result
      : executeGISVectorCommand(command, fc(a), {}, fc(b)).result;
    expect(output.features).toHaveLength(1);
    const actual = output.features[0].geometry as Polygon | MultiPolygon;
    const expected = reference.overlay[key] as Polygon;
    expect(booleanEqual(actual, expected)).toBe(true);
    expect(planarArea(actual)).toBeCloseTo(planarArea(expected), 10);
  });
  it.each(reference.centroids)("matches area/length weighted centroid for $geometry.type", ({ geometry, expected }) => {
    const output = executeGISVectorCommand("vector_centroids", fc(geometry));
    const point = output.result.features[0].geometry;
    expect(point.type).toBe("Point");
    if (point.type === "Point") {
      expect(point.coordinates[0]).toBeCloseTo(expected[0], 10);
      expect(point.coordinates[1]).toBeCloseTo(expected[1], 10);
    }
  });
  it("rejects a GEOS-invalid self-crossing polygon before publishing a result", () => {
    expect(() => executeGISVectorCommand("vector_dissolve", fc(reference.invalid))).toThrow(/inválida|auto-intersecção/);
  });
  it("matches the analytic spherical 1-degree distance used by Turf metrics", () => {
    const output = executeGISVectorCommand("vector_calc_metrics", fc({ type: "LineString", coordinates: [[0, 0], [1, 0]] }));
    const km = output.result.features[0].properties?._comprimento_km;
    expect(km).toBeCloseTo((6371008.8 * Math.PI / 180) / 1000, 1);
  });
});

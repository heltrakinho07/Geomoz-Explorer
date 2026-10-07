import { describe, expect, it } from "vitest";
import * as turf from "@turf/turf";
import {
  runVectorBBox,
  runVectorBuffer,
  runVectorCentroids,
  runVectorDifference,
  runVectorIntersect,
  runVectorMetrics,
  runVectorPointsInPolygon,
} from "../wasm-geoprocessing";

describe("GeoMoz GIS Workspace vector processing", () => {
  const squareA = turf.polygon(
    [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
    { name: "A" }
  );
  const squareB = turf.polygon(
    [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]],
    { name: "B" }
  );

  it("buffers a point into a polygon", () => {
    const input = turf.featureCollection([turf.point([35, -18])]);
    const { result, stats } = runVectorBuffer(input, 1, "kilometers");

    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.type).toMatch(/Polygon/);
    expect(stats.outputFeatureCount).toBe(1);
    expect(stats.totalAreaKm2).toBeGreaterThan(0);
  });

  it("calculates polygon centroids", () => {
    const input = turf.featureCollection([squareA]);
    const { result } = runVectorCentroids(input);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.type).toBe("Point");
    const [x, y] = (result.features[0].geometry as GeoJSON.Point).coordinates;
    expect(x).toBeCloseTo(1, 6);
    expect(y).toBeCloseTo(1, 6);
  });

  it("creates a bounding box polygon", () => {
    const input = turf.featureCollection([
      turf.point([0, 0]),
      turf.point([4, 3]),
    ]);
    const { result } = runVectorBBox(input);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.type).toBe("Polygon");
  });

  it("adds area and perimeter metrics", () => {
    const input = turf.featureCollection([squareA]);
    const { result } = runVectorMetrics(input);
    const props = result.features[0].properties ?? {};

    expect(Number(props._area_km2)).toBeGreaterThan(0);
    expect(Number(props._comprimento_km)).toBeGreaterThan(0);
  });

  it("computes polygon intersections", () => {
    const { result } = runVectorIntersect(
      turf.featureCollection([squareA]),
      turf.featureCollection([squareB])
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.type).toMatch(/Polygon/);
    expect(turf.area(result.features[0])).toBeGreaterThan(0);
  });

  it("computes polygon difference", () => {
    const source = turf.featureCollection([squareA]);
    const mask = turf.featureCollection([
      turf.polygon([[[1, 0], [2, 0], [2, 2], [1, 2], [1, 0]]]),
    ]);
    const sourceArea = turf.area(squareA);
    const { result } = runVectorDifference(source, mask);

    expect(result.features).toHaveLength(1);
    expect(turf.area(result.features[0])).toBeGreaterThan(0);
    expect(turf.area(result.features[0])).toBeLessThan(sourceArea);
  });

  it("counts points inside polygons", () => {
    const polygons = turf.featureCollection([squareA]);
    const points = turf.featureCollection([
      turf.point([0.5, 0.5]),
      turf.point([1.5, 1.5]),
      turf.point([4, 4]),
    ]);
    const { result } = runVectorPointsInPolygon(polygons, points);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?._contagem_pontos).toBe(2);
  });
});

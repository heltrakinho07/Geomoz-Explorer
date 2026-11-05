import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { GIS_VECTOR_COMMANDS, executeGISVectorCommand } from "../gis-vector-engine";

const points: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [32.58, -25.97] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [32.62, -25.98] } },
  ],
};
const polygon = (coordinates: number[][]): FeatureCollection => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } }],
});
const a = polygon([[32.5,-26.1],[32.7,-26.1],[32.7,-25.8],[32.5,-25.8],[32.5,-26.1]]);
const b = polygon([[32.6,-26.2],[32.8,-26.2],[32.8,-25.9],[32.6,-25.9],[32.6,-26.2]]);
const farAway = polygon([[38,-22],[38.1,-22],[38.1,-21.9],[38,-21.9],[38,-22]]);

describe("GIS Workspace live vector worker engine", () => {
  it("registers eleven explicit algorithms and rejects fake tools", () => {
    expect(GIS_VECTOR_COMMANDS).toHaveLength(11);
    expect(() => executeGISVectorCommand("terrain_slope", a)).toThrow(/não implementada/);
  });
  it("computes buffers and includes the actual engine and parameters", () => {
    const out = executeGISVectorCommand("vector_buffer", points, { distance: 1000, units: "meters" });
    expect(out.result.features).toHaveLength(2);
    expect(out.stats.totalAreaKm2).toBeGreaterThan(0);
    expect(out.provenance.engine).toBe("Turf.js");
    expect(out.provenance.parameters.distance).toBe(1000);
  });
  it("computes intersect and difference with distinct polygon areas", () => {
    const intersection = executeGISVectorCommand("vector_intersect", a, {}, b);
    expect(intersection.result.features.length).toBe(1);
    const difference = executeGISVectorCommand("vector_difference", a, {}, b);
    expect(difference.result.features.length).toBe(1);
    const source = executeGISVectorCommand("vector_calc_metrics", a);
    expect(difference.stats.totalAreaKm2).toBeLessThan(source.stats.totalAreaKm2!);
  });
  it("counts points by polygon and produces a geographic result", () => {
    const out = executeGISVectorCommand("vector_points_in_poly", a, {}, points);
    expect(out.result.features[0].properties?._contagem_pontos).toBe(2);
  });
  it("keeps genuinely disjoint intersections as empty but valid results", () => {
    const out = executeGISVectorCommand("vector_intersect", a, {}, farAway);
    expect(out.result.features).toHaveLength(0);
  });
  it("rejects non-WGS84 coordinates, mismatched input types and bad distances", () => {
    const bad: FeatureCollection = { type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [190, 0] } }] };
    expect(() => executeGISVectorCommand("vector_buffer", bad)).toThrow(/EPSG:4326/);
    expect(() => executeGISVectorCommand("vector_intersect", points, {}, a)).toThrow(/primeira camada/);
    expect(() => executeGISVectorCommand("vector_buffer", points, { distance: -100 })).toThrow(/entre/);
    expect(() => executeGISVectorCommand("vector_difference", a)).toThrow(/segunda camada/);
  });
  it("bounds quadratic overlay work before execution", () => {
    const many: FeatureCollection = { type: "FeatureCollection", features: Array(318).fill(a.features[0]) };
    expect(() => executeGISVectorCommand("vector_intersect", many, {}, many)).toThrow(/100 000/);
  });
});

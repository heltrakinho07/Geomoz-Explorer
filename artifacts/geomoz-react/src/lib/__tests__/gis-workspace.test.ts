import { describe, expect, it } from "vitest";
import {
  MAX_WORKSPACE_FEATURES,
  normalizeWorkspaceGeoJSON,
  parseWorkspaceText,
} from "../gis-workspace";

describe("GIS Workspace: local import", () => {
  it("normalizes a WGS84 Point into a FeatureCollection", () => {
    const result = normalizeWorkspaceGeoJSON({ type: "Point", coordinates: [32.58, -25.97] });
    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry?.type).toBe("Point");
  });

  it("rejects coordinates outside WGS84 bounds", () => {
    expect(() => normalizeWorkspaceGeoJSON({ type: "Point", coordinates: [250, -25] })).toThrow(/WGS84/);
    expect(() => normalizeWorkspaceGeoJSON({ type: "Point", coordinates: [32, 100] })).toThrow(/WGS84/);
  });

  it("rejects fake GeoJSON features rather than trusting a type label", () => {
    const invalid = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Unknown", coordinates: [32, -25] } }],
    };
    expect(() => normalizeWorkspaceGeoJSON(invalid)).toThrow(/não suportado/);
  });

  it("caps number of features", () => {
    const point = { type: "Feature", geometry: { type: "Point", coordinates: [32, -25] } };
    expect(() => normalizeWorkspaceGeoJSON({
      type: "FeatureCollection", features: Array(MAX_WORKSPACE_FEATURES + 1).fill(point),
    })).toThrow(/Máximo/);
  });

  it("imports CSV with quoted delimiters and semicolons", () => {
    const csv = 'latitude;longitude;nome\n-25.97;32.58;"Maputo; Cidade"';
    const result = parseWorkspaceText("locais.csv", csv);
    expect(result.geojson.features[0].properties?.nome).toBe("Maputo; Cidade");
    expect(result.geojson.features[0].geometry).toEqual({ type: "Point", coordinates: [32.58, -25.97] });
  });

  it("ignores empty/invalid CSV coordinates and rejects an all-invalid dataset", () => {
    expect(() => parseWorkspaceText("pontos.csv", "lat,lon,nome\n95,34,Fora\n,32,Vazio")).toThrow(/Nenhuma/);
  });

  it("rejects unsupported extensions, malformed JSON and badly quoted CSV", () => {
    expect(() => parseWorkspaceText("mapa.kml", "<kml/>")).toThrow(/Formatos/);
    expect(() => parseWorkspaceText("bad.json", "{not valid")).toThrow(/JSON/);
    expect(() => parseWorkspaceText("bad.csv", 'lat,lon,name\n-25,32,"unclosed')).toThrow(/aspas/);
  });
});

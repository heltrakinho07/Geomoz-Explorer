import { describe, it, expect } from "vitest";
import {
  parseGeologyCsv,
  parseGeologicalModel,
  parseGeologicalResult,
  sectionCells,
  type GeologicalModel,
  type GeologicalResult,
} from "../geological-model";
const model: GeologicalModel = {
  schemaVersion: 1,
  name: "Test",
  crs: "LOCAL",
  extent: [0, 1000, 0, 1000, 0, 1000],
  resolution: 16,
  interfaces: [{ name: "Sand", color: "#abcdef", kind: "layer" }],
  contacts: [
    { x: 0, y: 0, z: 500, formation: "Sand" },
    { x: 1000, y: 0, z: 500, formation: "Sand" },
    { x: 0, y: 1000, z: 500, formation: "Sand" },
  ],
  orientations: [
    {
      x: 500,
      y: 500,
      z: 500,
      azimuth: 90,
      dip: 0,
      polarity: 1,
      formation: "Sand",
    },
  ],
};
function result(): GeologicalResult {
  return {
    schemaVersion: 1,
    input: model,
    engine: {
      gempy: "2026.0.3",
      gempy_engine: "2026.0.3.post1",
      backend: "numpy",
      dtype: "float64",
    },
    grid: {
      resolution: [16, 16, 16],
      extent: model.extent,
      order: "xyz-C",
      sampling: "cell-centres",
      lithology: Array.from({ length: 4096 }, (_, i) => (i % 16 >= 8 ? 1 : 2)),
    },
    units: [
      { id: 1, name: "Sand", color: "#abcdef" },
      { id: 2, name: "basement", color: "#123456" },
    ],
    meshes: [],
    interpretation: "Synthetic",
  };
}
describe("geological contracts", () => {
  it("canonicalises the model name before computing and comparing results", () => {
    expect(parseGeologicalModel({ ...model, name: "  Test  " })).toEqual(model);
    expect(() => parseGeologicalModel({ ...model, name: "   " })).toThrow();
  });
  it("reads BOM, quoted names and semicolon decimal commas", () => {
    expect(
      parseGeologyCsv('\uFEFFX;Y;Z;formation\n1,5;2;3;"Sand"', "contacts")[0],
    ).toEqual({ x: 1.5, y: 2, z: 3, formation: "Sand" });
  });
  it("rejects missing numeric cells and wrong headers", () => {
    expect(() =>
      parseGeologyCsv("x,y,z,formation\n,2,3,Sand", "contacts"),
    ).toThrow();
    expect(() =>
      parseGeologyCsv("longitude,latitude,formation\n1,2,Sand", "contacts"),
    ).toThrow();
  });
  it("rejects wrong names, excessive resolution and out-of-domain contacts", () => {
    expect(() => parseGeologicalModel({ ...model, resolution: 256 })).toThrow();
    expect(() =>
      parseGeologicalModel({
        ...model,
        contacts: [
          ...model.contacts,
          { x: 1001, y: 2, z: 3, formation: "Sand" },
        ],
      }),
    ).toThrow();
  });
  it("preserves positive-upwards elevations in the section", () => {
    const cells = sectionCells(result(), "XZ", 3);
    expect(cells[0].id).toBe(1);
    expect(cells.at(-1)?.id).toBe(2);
  });
  it("uses C order and switches the fixed horizontal axis", () => {
    const r = result();
    r.grid.lithology = Array.from({ length: 4096 }, (_, i) => i);
    expect(sectionCells(r, "XZ", 3)[0].id).toBe(3 * 16 + 15);
    expect(sectionCells(r, "YZ", 3)[0].id).toBe(3 * 256 + 15);
  });
  it("rejects mismatched grid shapes and unknown classes", () => {
    const r = result();
    expect(parseGeologicalResult(r).grid.lithology).toHaveLength(4096);
    r.grid.lithology.pop();
    expect(() => parseGeologicalResult(r)).toThrow();
    const bad = result();
    bad.grid.lithology[0] = 9;
    expect(() => parseGeologicalResult(bad)).toThrow();
  });
  it("rejects out-of-range mesh indices", () => {
    const r = result();
    r.meshes = [
      {
        name: "Sand",
        color: "#abcdef",
        vertices: [[0, 0, 0]],
        triangles: [[0, 1, 2]],
      },
    ];
    expect(() => parseGeologicalResult(r)).toThrow();
  });
});

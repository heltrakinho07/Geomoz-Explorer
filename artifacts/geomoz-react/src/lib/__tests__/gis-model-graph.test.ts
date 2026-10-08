import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import {
  GIS_MODEL_INPUT_PORT,
  GIS_MODEL_OUTPUT_PORT,
  migrateLinearModelNodes,
  runGISModelGraph,
  topologicalOrderGISModel,
  validateGISModelGraph,
  type GISModelGraph,
  type GISModelToolDescriptor,
} from "../gis-model-graph";

const VECTOR_TOOL: GISModelToolDescriptor = {
  key: "turf:test-vector",
  provider: "turf",
  toolId: "test-vector",
  name: "Vector Test",
  group: "Test",
  inputs: [{ id: "input", label: "Input", kind: "vector", required: true }],
  outputs: [{ id: "output", label: "Output", kind: "vector" }],
  parameters: [],
};

const RASTER_TOOL: GISModelToolDescriptor = {
  key: "whitebox:test-raster",
  provider: "whitebox",
  toolId: "test-raster",
  name: "Raster Test",
  group: "Test",
  inputs: [{ id: "input", label: "Input", kind: "raster", required: true }],
  outputs: [{ id: "output", label: "Output", kind: "raster" }],
  parameters: [],
};

const FC: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: 1 },
      geometry: { type: "Point", coordinates: [32, -25] },
    },
  ],
};

function vectorGraph(): GISModelGraph {
  return {
    version: 1,
    nodes: [
      {
        id: "input",
        kind: "input",
        name: "Input",
        x: 0,
        y: 0,
        layerId: "layer-a",
        dataKind: "vector",
        parameters: {},
      },
      {
        id: "tool",
        kind: "tool",
        name: "Tool",
        x: 200,
        y: 0,
        provider: "turf",
        toolId: "test-vector",
        parameters: {},
      },
      {
        id: "output",
        kind: "output",
        name: "Final",
        x: 400,
        y: 0,
        dataKind: "vector",
        parameters: {},
      },
    ],
    edges: [
      {
        id: "e1",
        from: "input",
        fromPort: GIS_MODEL_INPUT_PORT,
        to: "tool",
        toPort: "input",
      },
      {
        id: "e2",
        from: "tool",
        fromPort: "output",
        to: "output",
        toPort: GIS_MODEL_OUTPUT_PORT,
      },
    ],
  };
}

describe("GIS hybrid model graph", () => {
  it("orders a DAG and rejects cycles", () => {
    const graph = vectorGraph();
    expect(topologicalOrderGISModel(graph)?.map((node) => node.id)).toEqual([
      "input",
      "tool",
      "output",
    ]);

    graph.edges.push({
      id: "cycle",
      from: "output",
      fromPort: "out",
      to: "input",
      toPort: "in",
    });
    expect(topologicalOrderGISModel(graph)).toBeNull();
    expect(
      validateGISModelGraph(graph, [VECTOR_TOOL], new Set(["layer-a"])).some(
        (issue) => issue.code === "cycle"
      )
    ).toBe(true);
  });

  it("rejects vector-to-raster connections before execution", () => {
    const graph: GISModelGraph = {
      version: 1,
      nodes: [
        {
          id: "input",
          kind: "input",
          name: "Vector",
          x: 0,
          y: 0,
          layerId: "vector-a",
          dataKind: "vector",
          parameters: {},
        },
        {
          id: "raster",
          kind: "tool",
          name: "Raster Tool",
          x: 200,
          y: 0,
          provider: "whitebox",
          toolId: "test-raster",
          parameters: {},
        },
        {
          id: "output",
          kind: "output",
          name: "Output",
          x: 400,
          y: 0,
          parameters: {},
        },
      ],
      edges: [
        {
          id: "bad",
          from: "input",
          fromPort: GIS_MODEL_INPUT_PORT,
          to: "raster",
          toPort: "input",
        },
        {
          id: "final",
          from: "raster",
          fromPort: "output",
          to: "output",
          toPort: GIS_MODEL_OUTPUT_PORT,
        },
      ],
    };

    const issues = validateGISModelGraph(
      graph,
      [RASTER_TOOL],
      new Set(["vector-a"])
    );
    expect(issues.some((issue) => issue.code === "type-mismatch")).toBe(true);
  });

  it("executes graph values in dependency order and emits the output", async () => {
    const graph = vectorGraph();
    const executeTool = vi.fn(async ({ inputs }) => ({
      output: {
        kind: "vector" as const,
        geojson: inputs.input.kind === "vector" ? inputs.input.geojson : FC,
        name: "processed",
      },
    }));
    const emitOutput = vi.fn();

    const issues = validateGISModelGraph(
      graph,
      [VECTOR_TOOL],
      new Set(["layer-a"])
    );
    expect(issues).toEqual([]);

    const result = await runGISModelGraph(graph, {
      catalog: [VECTOR_TOOL],
      resolveInput: async () => ({
        kind: "vector",
        geojson: FC,
        name: "source",
      }),
      executeTool,
      emitOutput,
    });

    expect(result.error).toBeUndefined();
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(emitOutput).toHaveBeenCalledTimes(1);
    expect(result.outputs.output.kind).toBe("vector");
  });

  it("migrates the legacy linear model into a connected graph", () => {
    const graph = migrateLinearModelNodes([
      {
        id: "legacy-1",
        toolId: "vector_buffer",
        name: "Buffer",
        parameters: { distance: 1000 },
      },
      {
        id: "legacy-2",
        toolId: "vector_dissolve",
        name: "Dissolve",
        parameters: {},
      },
    ]);

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "input",
      "tool",
      "tool",
      "output",
    ]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[1]).toMatchObject({
      from: "legacy-1",
      to: "legacy-2",
    });
  });
});

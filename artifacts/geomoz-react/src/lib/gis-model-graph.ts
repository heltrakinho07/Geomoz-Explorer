/**
 * Typed processing graph for the GeoMoz GIS Workspace.
 *
 * The architecture follows GeoLibre's MIT-licensed Model Builder concepts:
 * values carry vector/raster types, graph validation happens before execution,
 * and providers are resolved through adapters instead of being hard-coded into
 * the graph runner.
 *
 * Reference: https://github.com/opengeos/GeoLibre
 */

import type { FeatureCollection } from "geojson";
import type { ToolDefinition } from "@/lib/wasm-geoprocessing";
import {
  whiteboxManifestDefaults,
  whiteboxManifestName,
  whiteboxParamKind,
  whiteboxRasterSupport,
  whiteboxVectorSupport,
  type WhiteboxWasmManifest,
} from "@/lib/whitebox-wasm";

export type GISModelPortKind = "vector" | "raster" | "any";
export type GISModelProvider = "turf" | "whitebox";
export type GISModelNodeKind = "input" | "tool" | "output";

export interface GISModelToolPort {
  id: string;
  label: string;
  kind: GISModelPortKind;
  required?: boolean;
}

export interface GISModelParameterDescriptor {
  name: string;
  label: string;
  type: "number" | "select" | "boolean" | "text";
  required?: boolean;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface GISModelToolDescriptor {
  key: string;
  provider: GISModelProvider;
  toolId: string;
  name: string;
  group: string;
  description?: string;
  inputs: GISModelToolPort[];
  outputs: GISModelToolPort[];
  parameters: GISModelParameterDescriptor[];
  native?: unknown;
}

export interface GISModelNode {
  id: string;
  kind: GISModelNodeKind;
  name: string;
  x: number;
  y: number;
  layerId?: string;
  dataKind?: Exclude<GISModelPortKind, "any">;
  provider?: GISModelProvider;
  toolId?: string;
  parameters: Record<string, unknown>;
}

export interface GISModelEdge {
  id: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface GISModelGraph {
  version: 1;
  nodes: GISModelNode[];
  edges: GISModelEdge[];
}

export type GISModelValue =
  | {
      kind: "vector";
      geojson: FeatureCollection;
      name?: string;
    }
  | {
      kind: "raster";
      bytes: Uint8Array;
      name?: string;
      fileName?: string;
    };

export interface GISModelGraphIssue {
  code:
    | "duplicate-node"
    | "unknown-tool"
    | "missing-layer"
    | "missing-input"
    | "unknown-port"
    | "duplicate-input"
    | "type-mismatch"
    | "cycle"
    | "no-output"
    | "dangling-edge";
  nodeId?: string;
  edgeId?: string;
  detail?: string;
  message: string;
}

export const GIS_MODEL_INPUT_PORT = "out";
export const GIS_MODEL_OUTPUT_PORT = "in";

export function createEmptyGISModelGraph(): GISModelGraph {
  return { version: 1, nodes: [], edges: [] };
}

export function createDefaultGISModelGraph(): GISModelGraph {
  return {
    version: 1,
    nodes: [
      {
        id: "model_input",
        kind: "input",
        name: "Dados de entrada",
        x: 24,
        y: 72,
        dataKind: "vector",
        parameters: {},
      },
      {
        id: "model_tool_buffer",
        kind: "tool",
        name: "Buffer",
        x: 250,
        y: 72,
        provider: "turf",
        toolId: "vector_buffer",
        parameters: {
          distance: 1500,
          units: "meters",
          dissolve: false,
        },
      },
      {
        id: "model_output",
        kind: "output",
        name: "Resultado do modelo",
        x: 490,
        y: 72,
        parameters: {},
      },
    ],
    edges: [
      {
        id: "edge_input_buffer",
        from: "model_input",
        fromPort: GIS_MODEL_INPUT_PORT,
        to: "model_tool_buffer",
        toPort: "input",
      },
      {
        id: "edge_buffer_output",
        from: "model_tool_buffer",
        fromPort: "output",
        to: "model_output",
        toPort: GIS_MODEL_OUTPUT_PORT,
      },
    ],
  };
}

function vectorToolDescriptor(tool: ToolDefinition): GISModelToolDescriptor | null {
  if (tool.implemented === false) return null;
  return {
    key: `turf:${tool.id}`,
    provider: "turf",
    toolId: tool.id,
    name: tool.name,
    group: tool.categoryLabel,
    description: tool.description,
    inputs: [
      {
        id: "input",
        label: "Entrada",
        kind: "vector",
        required: true,
      },
      ...(tool.requiresSecondLayer
        ? [
            {
              id: "overlay",
              label: "Sobreposição",
              kind: "vector" as const,
              required: true,
            },
          ]
        : []),
    ],
    outputs: [
      {
        id: "output",
        label: "Resultado",
        kind: "vector",
      },
    ],
    parameters: tool.parameters.map((parameter) => ({
      name: parameter.name,
      label: parameter.label,
      type: parameter.type,
      default: parameter.default,
      options: parameter.options,
      min: parameter.min,
      max: parameter.max,
      step: parameter.step,
    })),
    native: tool,
  };
}

function whiteboxParameterDescriptor(
  manifest: WhiteboxWasmManifest
): GISModelParameterDescriptor[] {
  const defaults = whiteboxManifestDefaults(manifest);
  return (manifest.params ?? [])
    .filter((parameter) => {
      const kind = whiteboxParamKind(parameter);
      return !kind.endsWith("_in") && !kind.endsWith("_out");
    })
    .map((parameter) => {
      const kind = whiteboxParamKind(parameter);
      const numeric = /^(int|integer|double|float|number)$/i.test(kind);
      const boolean = /^bool(ean)?$/i.test(kind);
      const options = parameter.schema?.options ?? [];
      return {
        name: parameter.name,
        label: parameter.name,
        type: boolean
          ? ("boolean" as const)
          : options.length
            ? ("select" as const)
            : numeric
              ? ("number" as const)
              : ("text" as const),
        required: parameter.required,
        default: defaults[parameter.name],
        options: options.flatMap((option) =>
          option.value === undefined || option.value === null
            ? []
            : [
                {
                  value: String(option.value),
                  label: option.label ?? String(option.value),
                },
              ]
        ),
        description: parameter.description,
      };
    });
}

function whiteboxToolDescriptor(
  manifest: WhiteboxWasmManifest
): GISModelToolDescriptor | null {
  const vector = whiteboxVectorSupport(manifest);
  if (vector.supported) {
    return {
      key: `whitebox:${manifest.id}`,
      provider: "whitebox",
      toolId: manifest.id,
      name: whiteboxManifestName(manifest),
      group: manifest.category || "Whitebox Vector",
      description: manifest.summary,
      inputs: vector.vectorInputs.map((parameter) => ({
        id: parameter.name,
        label: parameter.name,
        kind: "vector" as const,
        required: parameter.required !== false,
      })),
      outputs: vector.vectorOutputs.map((parameter) => ({
        id: parameter.name,
        label: parameter.name,
        kind: "vector" as const,
      })),
      parameters: whiteboxParameterDescriptor(manifest),
      native: manifest,
    };
  }

  const raster = whiteboxRasterSupport(manifest);
  if (raster.supported) {
    return {
      key: `whitebox:${manifest.id}`,
      provider: "whitebox",
      toolId: manifest.id,
      name: whiteboxManifestName(manifest),
      group: manifest.category || "Whitebox Raster",
      description: manifest.summary,
      inputs: raster.rasterInputs.map((parameter) => ({
        id: parameter.name,
        label: parameter.name,
        kind: "raster" as const,
        required: parameter.required !== false,
      })),
      outputs: raster.rasterOutputs.map((parameter) => ({
        id: parameter.name,
        label: parameter.name,
        kind: "raster" as const,
      })),
      parameters: whiteboxParameterDescriptor(manifest),
      native: manifest,
    };
  }

  return null;
}

export function buildGISModelToolCatalog(
  vectorTools: ToolDefinition[],
  whiteboxTools: WhiteboxWasmManifest[]
): GISModelToolDescriptor[] {
  const vector = vectorTools
    .map(vectorToolDescriptor)
    .filter((tool): tool is GISModelToolDescriptor => Boolean(tool));
  const whitebox = whiteboxTools
    .map(whiteboxToolDescriptor)
    .filter((tool): tool is GISModelToolDescriptor => Boolean(tool));
  return [...vector, ...whitebox];
}

export function resolveGISModelDescriptor(
  catalog: GISModelToolDescriptor[],
  provider: GISModelProvider | undefined,
  toolId: string | undefined
): GISModelToolDescriptor | undefined {
  if (!provider || !toolId) return undefined;
  return catalog.find(
    (descriptor) =>
      descriptor.provider === provider && descriptor.toolId === toolId
  );
}

export function portKindsCompatible(
  from: GISModelPortKind,
  to: GISModelPortKind
): boolean {
  return from === "any" || to === "any" || from === to;
}

function portsForNode(
  node: GISModelNode,
  descriptor: GISModelToolDescriptor | undefined
): { inputs: GISModelToolPort[]; outputs: GISModelToolPort[] } {
  if (node.kind === "input") {
    return {
      inputs: [],
      outputs: [
        {
          id: GIS_MODEL_INPUT_PORT,
          label: "Dados",
          kind: node.dataKind ?? "any",
        },
      ],
    };
  }
  if (node.kind === "output") {
    return {
      inputs: [
        {
          id: GIS_MODEL_OUTPUT_PORT,
          label: "Resultado",
          kind: node.dataKind ?? "any",
          required: true,
        },
      ],
      outputs: [],
    };
  }
  return {
    inputs: descriptor?.inputs ?? [],
    outputs: descriptor?.outputs ?? [],
  };
}

export function topologicalOrderGISModel(
  graph: GISModelGraph
): GISModelNode[] | null {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const queue = graph.nodes.filter(
    (node) => (indegree.get(node.id) ?? 0) === 0
  );
  const ordered: GISModelNode[] = [];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor];
    ordered.push(node);
    for (const nextId of outgoing.get(node.id) ?? []) {
      const remaining = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, remaining);
      if (remaining === 0) {
        const next = byId.get(nextId);
        if (next) queue.push(next);
      }
    }
  }

  return ordered.length === graph.nodes.length ? ordered : null;
}

export function validateGISModelGraph(
  graph: GISModelGraph,
  catalog: GISModelToolDescriptor[],
  availableLayerIds?: Set<string>
): GISModelGraphIssue[] {
  const issues: GISModelGraphIssue[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const idCounts = new Map<string, number>();

  for (const node of graph.nodes) {
    idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1);
  }
  for (const [nodeId, count] of idCounts) {
    if (count > 1) {
      issues.push({
        code: "duplicate-node",
        nodeId,
        message: `Existem múltiplos nós com o id "${nodeId}".`,
      });
    }
  }

  const descriptors = new Map<string, GISModelToolDescriptor | undefined>();
  for (const node of graph.nodes) {
    if (node.kind !== "tool") continue;
    descriptors.set(
      node.id,
      resolveGISModelDescriptor(catalog, node.provider, node.toolId)
    );
  }

  for (const node of graph.nodes) {
    if (node.kind === "input") {
      if (!node.layerId) {
        issues.push({
          code: "missing-layer",
          nodeId: node.id,
          message: "Selecione uma camada para o nó de entrada.",
        });
      } else if (availableLayerIds && !availableLayerIds.has(node.layerId)) {
        issues.push({
          code: "missing-layer",
          nodeId: node.id,
          detail: node.layerId,
          message: `A camada "${node.layerId}" já não existe no workspace.`,
        });
      }
    }

    if (node.kind === "tool" && !descriptors.get(node.id)) {
      issues.push({
        code: "unknown-tool",
        nodeId: node.id,
        detail: node.toolId,
        message: `A ferramenta "${node.toolId ?? ""}" não está disponível.`,
      });
    }
  }

  const filled = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      issues.push({
        code: "dangling-edge",
        edgeId: edge.id,
        message: "A ligação aponta para um nó que já não existe.",
      });
      continue;
    }

    const fromPort = portsForNode(
      from,
      descriptors.get(from.id)
    ).outputs.find((port) => port.id === edge.fromPort);
    const toPort = portsForNode(
      to,
      descriptors.get(to.id)
    ).inputs.find((port) => port.id === edge.toPort);

    if (!fromPort || !toPort) {
      issues.push({
        code: "unknown-port",
        edgeId: edge.id,
        message: "A ligação aponta para uma porta que já não existe.",
      });
      continue;
    }

    if (!portKindsCompatible(fromPort.kind, toPort.kind)) {
      issues.push({
        code: "type-mismatch",
        edgeId: edge.id,
        detail: `${fromPort.kind}->${toPort.kind}`,
        message: `Não é possível ligar uma saída ${fromPort.kind} a uma entrada ${toPort.kind}.`,
      });
    }

    const seen = filled.get(to.id) ?? new Set<string>();
    if (seen.has(toPort.id)) {
      issues.push({
        code: "duplicate-input",
        edgeId: edge.id,
        nodeId: to.id,
        detail: toPort.id,
        message: `A porta "${toPort.label}" já possui uma ligação.`,
      });
    }
    seen.add(toPort.id);
    filled.set(to.id, seen);
  }

  for (const node of graph.nodes) {
    const descriptor = descriptors.get(node.id);
    if (node.kind === "tool" && !descriptor) continue;
    for (const port of portsForNode(node, descriptor).inputs) {
      if (!port.required) continue;
      if (filled.get(node.id)?.has(port.id)) continue;
      issues.push({
        code: "missing-input",
        nodeId: node.id,
        detail: port.id,
        message: `A entrada "${port.label}" precisa de uma ligação.`,
      });
    }
  }

  if (!topologicalOrderGISModel(graph)) {
    issues.push({
      code: "cycle",
      message: "O modelo contém um ciclo e não pode ser executado.",
    });
  }

  if (!graph.nodes.some((node) => node.kind === "output")) {
    issues.push({
      code: "no-output",
      message: "Adicione pelo menos um nó de saída ao modelo.",
    });
  }

  return issues;
}

export interface RunGISModelGraphOptions {
  catalog: GISModelToolDescriptor[];
  resolveInput: (
    node: GISModelNode
  ) => Promise<GISModelValue | null> | GISModelValue | null;
  executeTool: (args: {
    node: GISModelNode;
    descriptor: GISModelToolDescriptor;
    inputs: Record<string, GISModelValue>;
    signal?: AbortSignal;
  }) => Promise<Record<string, GISModelValue>>;
  emitOutput: (
    node: GISModelNode,
    value: GISModelValue
  ) => Promise<void> | void;
  signal?: AbortSignal;
  onNodeStatus?: (
    nodeId: string,
    status: "running" | "done" | "error"
  ) => void;
  log?: (message: string) => void;
}

export interface GISModelGraphRunResult {
  outputs: Record<string, GISModelValue>;
  producedByNode: Map<string, Record<string, GISModelValue>>;
  error?: { nodeId?: string; message: string };
}

export async function runGISModelGraph(
  graph: GISModelGraph,
  options: RunGISModelGraphOptions
): Promise<GISModelGraphRunResult> {
  const ordered = topologicalOrderGISModel(graph);
  const finalOutputs: Record<string, GISModelValue> = {};
  const produced = new Map<string, Record<string, GISModelValue>>();

  if (!ordered) {
    return {
      outputs: finalOutputs,
      producedByNode: produced,
      error: { message: "O modelo contém um ciclo." },
    };
  }

  const incoming = new Map<string, GISModelEdge[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.to) ?? [];
    list.push(edge);
    incoming.set(edge.to, list);
  }

  for (const node of ordered) {
    if (options.signal?.aborted) {
      return {
        outputs: finalOutputs,
        producedByNode: produced,
        error: { nodeId: node.id, message: "Execução cancelada." },
      };
    }

    const inputs: Record<string, GISModelValue> = {};
    for (const edge of incoming.get(node.id) ?? []) {
      const value = produced.get(edge.from)?.[edge.fromPort];
      if (value) inputs[edge.toPort] = value;
    }

    try {
      options.onNodeStatus?.(node.id, "running");

      if (node.kind === "input") {
        const value = await options.resolveInput(node);
        if (!value) {
          throw new Error(
            `A camada de entrada "${node.layerId ?? ""}" não contém dados utilizáveis.`
          );
        }
        produced.set(node.id, { [GIS_MODEL_INPUT_PORT]: value });
        options.log?.(`Entrada: ${node.name}`);
        options.onNodeStatus?.(node.id, "done");
        continue;
      }

      if (node.kind === "output") {
        const value = inputs[GIS_MODEL_OUTPUT_PORT];
        if (!value) {
          throw new Error("O nó de saída não recebeu nenhum resultado.");
        }
        await options.emitOutput(node, value);
        finalOutputs[node.id] = value;
        options.log?.(`Saída: ${node.name}`);
        options.onNodeStatus?.(node.id, "done");
        continue;
      }

      const descriptor = resolveGISModelDescriptor(
        options.catalog,
        node.provider,
        node.toolId
      );
      if (!descriptor) {
        throw new Error(
          `Ferramenta desconhecida: ${node.provider ?? "?"}:${node.toolId ?? "?"}`
        );
      }

      const nodeOutputs = await options.executeTool({
        node,
        descriptor,
        inputs,
        signal: options.signal,
      });
      produced.set(node.id, nodeOutputs);
      options.log?.(`Concluído: ${node.name}`);
      options.onNodeStatus?.(node.id, "done");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.log?.(`Erro em ${node.name}: ${message}`);
      options.onNodeStatus?.(node.id, "error");
      return {
        outputs: finalOutputs,
        producedByNode: produced,
        error: { nodeId: node.id, message },
      };
    }
  }

  return { outputs: finalOutputs, producedByNode: produced };
}

export function migrateLinearModelNodes(
  nodes: Array<{
    id: string;
    toolId: string;
    name: string;
    parameters: Record<string, unknown>;
  }>
): GISModelGraph {
  if (!nodes.length) return createDefaultGISModelGraph();

  const inputId = "model_input";
  const outputId = "model_output";
  const toolNodes: GISModelNode[] = nodes.map((node, index) => ({
    id: node.id,
    kind: "tool",
    name: node.name,
    x: 230 + index * 230,
    y: 72,
    provider: "turf",
    toolId: node.toolId,
    parameters: { ...node.parameters },
  }));

  const graphNodes: GISModelNode[] = [
    {
      id: inputId,
      kind: "input",
      name: "Dados de entrada",
      x: 24,
      y: 72,
      dataKind: "vector",
      parameters: {},
    },
    ...toolNodes,
    {
      id: outputId,
      kind: "output",
      name: "Resultado do modelo",
      x: 230 + toolNodes.length * 230,
      y: 72,
      parameters: {},
    },
  ];

  const edges: GISModelEdge[] = [];
  let previousNode = inputId;
  let previousPort = GIS_MODEL_INPUT_PORT;
  for (const node of toolNodes) {
    edges.push({
      id: `edge_${previousNode}_${node.id}`,
      from: previousNode,
      fromPort: previousPort,
      to: node.id,
      toPort: "input",
    });
    previousNode = node.id;
    previousPort = "output";
  }
  edges.push({
    id: `edge_${previousNode}_${outputId}`,
    from: previousNode,
    fromPort: previousPort,
    to: outputId,
    toPort: GIS_MODEL_OUTPUT_PORT,
  });

  return { version: 1, nodes: graphNodes, edges };
}

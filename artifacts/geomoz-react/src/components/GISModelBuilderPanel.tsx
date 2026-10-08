import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Database,
  Download,
  GitBranch,
  Layers,
  LayoutGrid,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import {
  GIS_MODEL_INPUT_PORT,
  GIS_MODEL_OUTPUT_PORT,
  portKindsCompatible,
  resolveGISModelDescriptor,
  topologicalOrderGISModel,
  validateGISModelGraph,
  type GISModelEdge,
  type GISModelGraph,
  type GISModelNode,
  type GISModelPortKind,
  type GISModelToolDescriptor,
} from "@/lib/gis-model-graph";

interface LayerOption {
  id: string;
  name: string;
}

interface Props {
  graph: GISModelGraph;
  onGraphChange: (graph: GISModelGraph) => void;
  catalog: GISModelToolDescriptor[];
  vectorLayers: LayerOption[];
  rasterLayers: LayerOption[];
  running: boolean;
  nodeStatus: Record<string, "running" | "done" | "error">;
  log: string[];
  onRun: () => void;
}

const CARD_W = 220;
const CARD_MIN_H = 142;

function createId(prefix: string): string {
  return `${prefix}_${
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  }`;
}

function outputPorts(
  node: GISModelNode,
  catalog: GISModelToolDescriptor[]
): Array<{ id: string; label: string; kind: GISModelPortKind }> {
  if (node.kind === "input") {
    return [
      {
        id: GIS_MODEL_INPUT_PORT,
        label: "Dados",
        kind: node.dataKind ?? "any",
      },
    ];
  }
  if (node.kind === "output") return [];
  return (
    resolveGISModelDescriptor(catalog, node.provider, node.toolId)?.outputs ?? []
  );
}

function inputPorts(
  node: GISModelNode,
  catalog: GISModelToolDescriptor[]
): Array<{
  id: string;
  label: string;
  kind: GISModelPortKind;
  required?: boolean;
}> {
  if (node.kind === "input") return [];
  if (node.kind === "output") {
    return [
      {
        id: GIS_MODEL_OUTPUT_PORT,
        label: "Resultado",
        kind: node.dataKind ?? "any",
        required: true,
      },
    ];
  }
  return (
    resolveGISModelDescriptor(catalog, node.provider, node.toolId)?.inputs ?? []
  );
}

function nodeTone(node: GISModelNode): string {
  if (node.kind === "input") {
    return "border-emerald-300 bg-emerald-50/95 dark:border-emerald-800 dark:bg-emerald-950/40";
  }
  if (node.kind === "output") {
    return "border-purple-300 bg-purple-50/95 dark:border-purple-800 dark:bg-purple-950/40";
  }
  if (node.provider === "whitebox") {
    return "border-sky-300 bg-sky-50/95 dark:border-sky-800 dark:bg-sky-950/40";
  }
  return "border-indigo-300 bg-indigo-50/95 dark:border-indigo-800 dark:bg-indigo-950/40";
}

function statusRing(status: "running" | "done" | "error" | undefined): string {
  if (status === "running") return "ring-2 ring-amber-400";
  if (status === "done") return "ring-2 ring-emerald-400";
  if (status === "error") return "ring-2 ring-rose-500";
  return "";
}

export default function GISModelBuilderPanel({
  graph,
  onGraphChange,
  catalog,
  vectorLayers,
  rasterLayers,
  running,
  nodeStatus,
  log,
  onRun,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const availableLayerIds = useMemo(
    () =>
      new Set([
        ...vectorLayers.map((layer) => layer.id),
        ...rasterLayers.map((layer) => layer.id),
      ]),
    [rasterLayers, vectorLayers]
  );

  const issues = useMemo(
    () => validateGISModelGraph(graph, catalog, availableLayerIds),
    [availableLayerIds, catalog, graph]
  );

  const issuesByNode = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      const current = result.get(issue.nodeId) ?? [];
      current.push(issue.message);
      result.set(issue.nodeId, current);
    }
    return result;
  }, [issues]);

  const filteredCatalog = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog
      .filter((tool) => {
        if (!needle) return true;
        return [tool.name, tool.group, tool.description ?? "", tool.toolId]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, 120);
  }, [catalog, search]);

  const canvasSize = useMemo(() => {
    const maxX = graph.nodes.reduce((max, node) => Math.max(max, node.x), 0);
    const maxY = graph.nodes.reduce((max, node) => Math.max(max, node.y), 0);
    return {
      width: Math.max(920, maxX + CARD_W + 120),
      height: Math.max(440, maxY + 280),
    };
  }, [graph.nodes]);

  const beginNodeDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    node: GISModelNode
  ) => {
    if ((event.target as HTMLElement).closest("button,input,select,label")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      nodeId: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
    };
    setSelectedNodeId(node.id);
  };

  const moveNodeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = Math.max(8, drag.startX + event.clientX - drag.startClientX);
    const nextY = Math.max(8, drag.startY + event.clientY - drag.startClientY);
    onGraphChange({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === drag.nodeId ? { ...node, x: nextX, y: nextY } : node
      ),
    });
  };

  const endNodeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const mutateNode = (
    nodeId: string,
    mutation: (node: GISModelNode) => GISModelNode
  ) => {
    onGraphChange({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId ? mutation(node) : node
      ),
    });
  };

  const removeNode = (nodeId: string) => {
    onGraphChange({
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== nodeId),
      edges: graph.edges.filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId
      ),
    });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const exportModel = () => {
    const payload = JSON.stringify(
      {
        schema: "https://geolithica.com/schemas/geomoz-gis-model-v1.json",
        version: 1,
        exportedAt: new Date().toISOString(),
        graph,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "geomoz-model.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importModelFile = async (file: File) => {
    setFileError(null);
    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error("O modelo excede o limite de 4 MB.");
      }
      const parsed = JSON.parse(await file.text()) as {
        schema?: unknown;
        version?: unknown;
        graph?: unknown;
      };
      const candidate = parsed.graph as Partial<GISModelGraph> | undefined;
      if (
        !candidate ||
        candidate.version !== 1 ||
        !Array.isArray(candidate.nodes) ||
        !Array.isArray(candidate.edges)
      ) {
        throw new Error("O ficheiro não contém um grafo GeoMoz v1 válido.");
      }
      if (candidate.nodes.length > 500 || candidate.edges.length > 1000) {
        throw new Error("O modelo excede o limite de 500 nós / 1000 ligações.");
      }

      const validNodes = candidate.nodes.every(
        (node) =>
          node &&
          typeof node.id === "string" &&
          ["input", "tool", "output"].includes(node.kind) &&
          typeof node.name === "string" &&
          Number.isFinite(node.x) &&
          Number.isFinite(node.y) &&
          node.parameters &&
          typeof node.parameters === "object"
      );
      const validEdges = candidate.edges.every(
        (edge) =>
          edge &&
          typeof edge.id === "string" &&
          typeof edge.from === "string" &&
          typeof edge.fromPort === "string" &&
          typeof edge.to === "string" &&
          typeof edge.toPort === "string"
      );
      if (!validNodes || !validEdges) {
        throw new Error("O ficheiro possui nós ou ligações inválidas.");
      }

      onGraphChange(candidate as GISModelGraph);
      setSelectedNodeId(null);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const addInput = (kind: "vector" | "raster") => {
    const count = graph.nodes.length;
    const node: GISModelNode = {
      id: createId(`input_${kind}`),
      kind: "input",
      name: kind === "vector" ? "Entrada vetorial" : "Entrada raster",
      x: 24 + (count % 3) * 250,
      y: 36 + Math.floor(count / 3) * 210,
      dataKind: kind,
      parameters: {},
    };
    onGraphChange({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedNodeId(node.id);
  };

  const addOutput = () => {
    const count = graph.nodes.length;
    const node: GISModelNode = {
      id: createId("output"),
      kind: "output",
      name: "Resultado do modelo",
      x: 24 + (count % 3) * 250,
      y: 36 + Math.floor(count / 3) * 210,
      parameters: {},
    };
    onGraphChange({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedNodeId(node.id);
  };

  const addTool = (descriptor: GISModelToolDescriptor) => {
    const count = graph.nodes.length;
    const defaults = Object.fromEntries(
      descriptor.parameters.flatMap((parameter) =>
        parameter.default === undefined
          ? []
          : [[parameter.name, parameter.default]]
      )
    );
    const node: GISModelNode = {
      id: createId("tool"),
      kind: "tool",
      name: descriptor.name,
      x: 24 + (count % 3) * 250,
      y: 36 + Math.floor(count / 3) * 210,
      provider: descriptor.provider,
      toolId: descriptor.toolId,
      parameters: defaults,
    };
    onGraphChange({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedNodeId(node.id);
  };

  const setConnection = (
    targetNode: GISModelNode,
    targetPort: string,
    serialized: string
  ) => {
    const withoutCurrent = graph.edges.filter(
      (edge) => !(edge.to === targetNode.id && edge.toPort === targetPort)
    );
    if (!serialized) {
      onGraphChange({ ...graph, edges: withoutCurrent });
      return;
    }

    const [from, fromPort] = serialized.split("::");
    const edge: GISModelEdge = {
      id: createId("edge"),
      from,
      fromPort,
      to: targetNode.id,
      toPort: targetPort,
    };
    onGraphChange({ ...graph, edges: [...withoutCurrent, edge] });
  };

  const autoLayout = () => {
    const ordered = topologicalOrderGISModel(graph) ?? graph.nodes;
    const depth = new Map<string, number>();
    const incoming = new Map<string, GISModelEdge[]>();
    for (const edge of graph.edges) {
      const list = incoming.get(edge.to) ?? [];
      list.push(edge);
      incoming.set(edge.to, list);
    }

    for (const node of ordered) {
      const upstreamDepth = (incoming.get(node.id) ?? []).map(
        (edge) => depth.get(edge.from) ?? 0
      );
      depth.set(
        node.id,
        upstreamDepth.length ? Math.max(...upstreamDepth) + 1 : 0
      );
    }

    const byDepth = new Map<number, GISModelNode[]>();
    for (const node of ordered) {
      const d = depth.get(node.id) ?? 0;
      const list = byDepth.get(d) ?? [];
      list.push(node);
      byDepth.set(d, list);
    }

    onGraphChange({
      ...graph,
      nodes: graph.nodes.map((node) => {
        const d = depth.get(node.id) ?? 0;
        const column = byDepth.get(d) ?? [];
        const row = column.findIndex((candidate) => candidate.id === node.id);
        return {
          ...node,
          x: 30 + d * 260,
          y: 40 + Math.max(0, row) * 220,
        };
      }),
    });
  };

  const edgePath = (edge: GISModelEdge) => {
    const from = graph.nodes.find((node) => node.id === edge.from);
    const to = graph.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return null;
    const x1 = from.x + CARD_W;
    const y1 = from.y + 72;
    const x2 = to.x;
    const y2 = to.y + 72;
    const bend = Math.max(50, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="flex min-h-[560px] flex-col gap-3">
      <div className="rounded-xl border border-purple-100 bg-purple-50 p-2.5 text-[11px] text-purple-900 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-300">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Model Builder · Grafo híbrido</span>
          <span className="text-[9px] font-bold">
            {graph.nodes.length} nós · {graph.edges.length} ligações
          </span>
        </div>
        <p className="mt-1">
          Encadeie dados vetoriais e raster com Turf.js e Whitebox WASM.
          Arraste os nós para organizar o canvas. Ligações incompatíveis são bloqueadas pela validação antes da execução.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => addInput("vector")}
          className="flex items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          <Plus size={11} /> Entrada vetor
        </button>
        <button
          type="button"
          onClick={() => addInput("raster")}
          className="flex items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 py-1.5 text-[10px] font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
        >
          <Plus size={11} /> Entrada raster
        </button>
        <button
          type="button"
          onClick={addOutput}
          className="flex items-center justify-center gap-1 rounded-lg border border-purple-200 bg-purple-50 py-1.5 text-[10px] font-bold text-purple-700 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-300"
        >
          <Plus size={11} /> Saída
        </button>
        <button
          type="button"
          onClick={autoLayout}
          className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <LayoutGrid size={11} /> Auto layout
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importModelFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <Upload size={11} /> Importar modelo
        </button>
        <button
          type="button"
          onClick={exportModel}
          className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <Download size={11} /> Exportar modelo
        </button>
      </div>

      {fileError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[9px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {fileError}
        </div>
      )}

      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Adicionar ferramenta Turf ou Whitebox…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2 text-[10px] dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      {search.trim() && (
        <div className="max-h-44 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
          {filteredCatalog.length === 0 ? (
            <div className="p-3 text-center text-[10px] text-slate-400">
              Nenhuma ferramenta encontrada.
            </div>
          ) : (
            filteredCatalog.map((tool) => (
              <button
                key={tool.key}
                type="button"
                onClick={() => {
                  addTool(tool);
                  setSearch("");
                }}
                className="flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    {tool.name}
                  </div>
                  <div className="truncate text-[9px] text-slate-400">
                    {tool.group}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold ${
                    tool.provider === "whitebox"
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  }`}
                >
                  {tool.provider === "whitebox" ? "WASM" : "Turf"}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="relative h-[440px] overflow-auto rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.18)_1px,_transparent_1px)] bg-[length:18px_18px] dark:border-slate-700 dark:bg-slate-950">
        <div
          className="relative"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            width={canvasSize.width}
            height={canvasSize.height}
          >
            {graph.edges.map((edge) => {
              const path = edgePath(edge);
              if (!path) return null;
              const hasIssue = issues.some((issue) => issue.edgeId === edge.id);
              return (
                <path
                  key={edge.id}
                  d={path}
                  fill="none"
                  stroke={hasIssue ? "#e11d48" : "#64748b"}
                  strokeWidth={hasIssue ? 2.5 : 2}
                  strokeDasharray={hasIssue ? "5 4" : undefined}
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const descriptor =
              node.kind === "tool"
                ? resolveGISModelDescriptor(
                    catalog,
                    node.provider,
                    node.toolId
                  )
                : undefined;
            const ports = inputPorts(node, catalog);
            const nodeIssues = issuesByNode.get(node.id) ?? [];
            const selected = selectedNodeId === node.id;
            const status = nodeStatus[node.id];
            const layerOptions =
              node.dataKind === "raster" ? rasterLayers : vectorLayers;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                onPointerDown={(event) => beginNodeDrag(event, node)}
                onPointerMove={moveNodeDrag}
                onPointerUp={endNodeDrag}
                onPointerCancel={endNodeDrag}
                className={`absolute touch-none cursor-grab active:cursor-grabbing rounded-xl border p-2.5 shadow-sm transition-shadow ${nodeTone(
                  node
                )} ${statusRing(status)} ${
                  selected ? "shadow-lg ring-2 ring-indigo-400/70" : ""
                }`}
                style={{
                  width: CARD_W,
                  minHeight: CARD_MIN_H,
                  left: node.x,
                  top: node.y,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      {node.kind === "input" ? (
                        node.dataKind === "raster" ? (
                          <Database size={12} />
                        ) : (
                          <Layers size={12} />
                        )
                      ) : node.kind === "output" ? (
                        <GitBranch size={12} />
                      ) : node.provider === "whitebox" ? (
                        <Boxes size={12} />
                      ) : (
                        <Workflow size={12} />
                      )}
                      <span className="truncate text-[10px] font-extrabold text-slate-800 dark:text-slate-100">
                        {node.name}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[8px] uppercase tracking-wider text-slate-400">
                      {node.kind === "tool"
                        ? `${node.provider} · ${node.toolId}`
                        : node.kind}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeNode(node.id);
                    }}
                    className="text-slate-400 hover:text-rose-600"
                    title="Remover nó"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {node.kind === "input" && (
                  <select
                    value={node.layerId ?? ""}
                    onChange={(event) =>
                      mutateNode(node.id, (current) => ({
                        ...current,
                        layerId: event.target.value || undefined,
                      }))
                    }
                    className="mt-2 w-full rounded-md border border-white/70 bg-white/90 p-1.5 text-[9px] dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">Selecionar camada…</option>
                    {layerOptions.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                )}

                {node.kind === "output" && (
                  <input
                    value={node.name}
                    onChange={(event) =>
                      mutateNode(node.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-md border border-white/70 bg-white/90 p-1.5 text-[9px] dark:border-slate-700 dark:bg-slate-900"
                  />
                )}

                {ports.map((port) => {
                  const currentEdge = graph.edges.find(
                    (edge) =>
                      edge.to === node.id && edge.toPort === port.id
                  );
                  const upstream = graph.nodes.flatMap((candidate) =>
                    candidate.id === node.id
                      ? []
                      : outputPorts(candidate, catalog)
                          .filter((output) =>
                            portKindsCompatible(output.kind, port.kind)
                          )
                          .map((output) => ({
                            value: `${candidate.id}::${output.id}`,
                            label: `${candidate.name} · ${output.label}`,
                          }))
                  );
                  return (
                    <label key={port.id} className="mt-2 block">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {port.label} · {port.kind}
                      </span>
                      <select
                        value={
                          currentEdge
                            ? `${currentEdge.from}::${currentEdge.fromPort}`
                            : ""
                        }
                        onChange={(event) =>
                          setConnection(node, port.id, event.target.value)
                        }
                        className="mt-0.5 w-full rounded-md border border-white/70 bg-white/90 p-1 text-[8px] dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="">
                          {port.required ? "Ligação obrigatória…" : "Sem ligação"}
                        </option>
                        {upstream.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}

                {node.kind === "tool" &&
                  descriptor?.parameters.map((parameter) => {
                    const value =
                      node.parameters[parameter.name] ??
                      parameter.default ??
                      "";
                    return (
                      <label key={parameter.name} className="mt-2 block">
                        <span className="text-[8px] font-semibold text-slate-500 dark:text-slate-400">
                          {parameter.label}
                        </span>
                        {parameter.type === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(event) =>
                              mutateNode(node.id, (current) => ({
                                ...current,
                                parameters: {
                                  ...current.parameters,
                                  [parameter.name]: event.target.checked,
                                },
                              }))
                            }
                            className="ml-2 align-middle"
                          />
                        ) : parameter.type === "select" ? (
                          <select
                            value={String(value)}
                            onChange={(event) =>
                              mutateNode(node.id, (current) => ({
                                ...current,
                                parameters: {
                                  ...current.parameters,
                                  [parameter.name]: event.target.value,
                                },
                              }))
                            }
                            className="mt-0.5 w-full rounded-md border border-white/70 bg-white/90 p-1 text-[8px] dark:border-slate-700 dark:bg-slate-900"
                          >
                            {(parameter.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={parameter.type === "number" ? "number" : "text"}
                            min={parameter.min}
                            max={parameter.max}
                            step={parameter.step}
                            value={String(value)}
                            onChange={(event) =>
                              mutateNode(node.id, (current) => ({
                                ...current,
                                parameters: {
                                  ...current.parameters,
                                  [parameter.name]:
                                    parameter.type === "number"
                                      ? event.target.value === ""
                                        ? ""
                                        : Number(event.target.value)
                                      : event.target.value,
                                },
                              }))
                            }
                            className="mt-0.5 w-full rounded-md border border-white/70 bg-white/90 p-1 text-[8px] dark:border-slate-700 dark:bg-slate-900"
                          />
                        )}
                      </label>
                    );
                  })}

                {nodeIssues.length > 0 && (
                  <div className="mt-2 rounded-md bg-rose-100/80 p-1.5 text-[8px] text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {nodeIssues[0]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="mb-1 flex items-center gap-1 font-bold">
            <AlertTriangle size={12} />
            {issues.length} problema(s) a resolver antes de executar
          </div>
          <div className="max-h-24 overflow-auto">
            {issues.slice(0, 8).map((issue, index) => (
              <div key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`}>
                • {issue.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="max-h-24 overflow-auto rounded-lg bg-slate-950 p-2 font-mono text-[9px] text-slate-300">
          {log.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onRun}
        disabled={running || issues.length > 0 || graph.nodes.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play size={14} />
        {running ? "A executar grafo…" : "Executar modelo híbrido"}
      </button>
    </div>
  );
}

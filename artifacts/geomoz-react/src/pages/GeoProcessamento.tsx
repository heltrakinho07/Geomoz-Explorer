/**
 * GeoMoz GIS Workspace — Ambiente GIS Integrado e Persistente
 * Fiel à arquitetura e estrutura do GeoLibre (https://geolibre.app/user-guide/processing/):
 *
 * 1. Whitebox Toolbox (1.000+ ferramentas categorizadas: Vector, Raster, Hydrology, Terrain, LiDAR, etc.)
 * 2. GeoLibre Toolbox (Ferramentas direcionadas: Geometria, Sobreposição, Junção, Seleção, Raster, Conversão, Estatística)
 * 3. Model Builder (Construção visual de pipelines encadeados de análise)
 * 4. SQL Workspace (DuckDB-WASM Spatial sobre as camadas do próprio utilizador)
 * 5. Dashboard Analítico (Histogramas, dispersão e indicadores de atributos via Recharts)
 * 6. Histórico de Processamento (Registo cronológico com Re-run e exportação de logs)
 * 7. Cortina Temporal Swipe & Mapa Interativo (Visualização sincronizada antes/depois)
 *
 * 100% Funcional e operando em DADOS PRÓPRIOS DO UTILIZADOR (sem mocks).
 */

import React, { useState, useRef, useMemo, useCallback } from "react";
import GISWorkspaceMapLibre from "@/components/GISWorkspaceMapLibre";
import {
  Wrench,
  Boxes,
  Workflow,
  Database,
  BarChart3,
  History,
  Columns2,
  Layers,
  Upload,
  Download,
  Play,
  Search,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Table,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileDown,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Filter,
  FileCode,
  Copy,
  Info,
  Maximize2,
  X,
  Compass,
  Mountain,
  Waves,
  Cpu,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import { BasemapType } from "@/lib/basemaps";
import type { AreaOfInterest } from "@/lib/aoi";
import { GLOBAL_AOI, customAOI } from "@/lib/aoi";
import {
  GEOPROCESSING_TOOLS_CATALOG,
  ToolDefinition,
  GeoprocessingStats,
  parseUserUploadedFile,
  runVectorBuffer,
  runVectorCentroids,
  runVectorConvexHull,
  runVectorBBox,
  runVectorDissolve,
  runVectorSimplify,
  runVectorExplode,
  runVectorMetrics,
  runVectorIntersect,
  runVectorDifference,
  runVectorPointsInPolygon,
} from "@/lib/wasm-geoprocessing";
import { exportToCsv, exportToGeoJson, QueryResult } from "@/lib/cloud-native-loader";
import {
  executeDuckDbSpatialQuery,
  importVectorFileWithDuckDb,
  sanitizeDuckDbTableName,
} from "@/lib/duckdb-spatial";
import {
  createPDFContext,
  drawCover,
  sectionTitle,
  addPDFFooter,
  drawStatCards,
  drawTable,
  MARGIN,
  CONTENT_W,
} from "@/lib/pdf-export";
import type { FeatureCollection, Feature } from "geojson";
import { useProject } from "@/context/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import {
  loadGISWorkspaceFromCloud,
  syncGISWorkspaceToCloud,
} from "@/services/gisWorkspaceCloudService";
import {
  loadGISWorkspaceSnapshot,
  saveGISWorkspaceSnapshot,
} from "@/lib/gis-workspace-persistence";
import {
  listWhiteboxWasmManifests,
  runWhiteboxVectorTool,
  whiteboxManifestDefaults,
  whiteboxManifestName,
  whiteboxParamKind,
  whiteboxVectorSupport,
  type WhiteboxWasmManifest,
} from "@/lib/whitebox-wasm";

export interface UserLayer {
  id: string;
  name: string;
  geojson: FeatureCollection;
  featureCount: number;
  geometryType: string;
  fields: string[];
  color: string;
  visible: boolean;
  isResult?: boolean;
}

export interface ProcessingHistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  engine: "Client (Turf.js)" | "WASM" | "DuckDB Spatial";
  timestamp: string;
  durationMs: number;
  inputLayerName: string;
  outputCount: number;
  status: "success" | "error";
  parameters: Record<string, any>;
}

export interface ModelNode {
  id: string;
  toolId: string;
  name: string;
  parameters: Record<string, any>;
}

type MainTab =
  | "geolibre_toolbox"
  | "whitebox_toolbox"
  | "model_builder"
  | "sql_workspace"
  | "dashboard"
  | "history"
  | "layers"
  | "swipe";

interface Props {
  aoi: AreaOfInterest;
  province: string | null;
  district: string | null;
  viewMode?: "2d" | "3d";
  onViewModeChange?: (m: "2d" | "3d") => void;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
  onAOIChange: (aoi: AreaOfInterest) => void;
}

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#d97706",
  "#db2777",
];

export default function GeoProcessamento({
  aoi,
  province,
  district,
  viewMode = "2d",
  onViewModeChange,
  onProvinceChange,
  onDistrictChange,
  onAOIChange,
}: Props) {
  const { toast } = useToast();
  const { activeProject } = useProject();
  const { user } = useAuth();
  const workspaceProjectId = activeProject?.id ?? "session-default";
  const cloudUid =
    user?.uid && user.uid !== "guest_user" && !user.uid.startsWith("guest_")
      ? user.uid
      : null;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Main UI Navigation
  const [activeTab, setActiveTab] = useState<MainTab>("geolibre_toolbox");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  // User Layers
  const [layers, setLayers] = useState<UserLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("");
  const [secondLayerId, setSecondLayerId] = useState<string>("");
  const [tableLayerId, setTableLayerId] = useState<string | null>(null);

  // Selected tool & parameters
  const [selectedToolId, setSelectedToolId] = useState<string>("vector_buffer");
  const [toolSearch, setToolSearch] = useState<string>("");
  const [toolCategoryFilter, setToolCategoryFilter] = useState<string>("all");
  const [toolParams, setToolParams] = useState<Record<string, any>>({
    distance: 1000,
    units: "meters",
    dissolve: false,
    tolerance: 0.005,
    highQuality: true,
  });
  const [isExecuting, setIsExecuting] = useState(false);

  // Real Whitebox / GeoLibre WASM catalog (lazy-loaded only when the tab opens).
  const [whiteboxTools, setWhiteboxTools] = useState<WhiteboxWasmManifest[]>([]);
  const [whiteboxLoading, setWhiteboxLoading] = useState(false);
  const [whiteboxError, setWhiteboxError] = useState<string | null>(null);
  const [selectedWhiteboxToolId, setSelectedWhiteboxToolId] = useState("");
  const [whiteboxParams, setWhiteboxParams] = useState<Record<string, unknown>>({});

  // Processing History
  const [history, setHistory] = useState<ProcessingHistoryEntry[]>([]);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const hydratedProjectRef = useRef<string | null>(null);

  // Model Builder
  const [modelNodes, setModelNodes] = useState<ModelNode[]>([
    { id: "node_1", toolId: "vector_buffer", name: "Buffer", parameters: { distance: 1500, units: "meters", dissolve: false } },
    { id: "node_2", toolId: "vector_dissolve", name: "Dissolve", parameters: { propertyName: "" } },
  ]);

  // Restore the newest available workspace snapshot. IndexedDB is the fast
  // offline cache; authenticated projects additionally use Firestore + Storage.
  React.useEffect(() => {
    let cancelled = false;
    setWorkspaceHydrated(false);
    hydratedProjectRef.current = null;

    const load = async () => {
      const localPromise = loadGISWorkspaceSnapshot(workspaceProjectId);
      const cloudPromise =
        cloudUid && activeProject?.id
          ? loadGISWorkspaceFromCloud(cloudUid, workspaceProjectId).catch((error) => {
              console.warn("GIS Workspace: cloud restore unavailable, using local cache:", error);
              return null;
            })
          : Promise.resolve(null);

      const [localSnapshot, cloudSnapshot] = await Promise.all([
        localPromise,
        cloudPromise,
      ]);
      if (cancelled) return;

      const localTime = localSnapshot ? Date.parse(localSnapshot.updatedAt) || 0 : 0;
      const cloudTime = cloudSnapshot ? Date.parse(cloudSnapshot.updatedAt) || 0 : 0;
      const snapshot =
        cloudSnapshot && cloudTime > localTime ? cloudSnapshot : localSnapshot ?? cloudSnapshot;

      if (snapshot) {
        setLayers(snapshot.layers as UserLayer[]);
        setSelectedLayerId(snapshot.selectedLayerId || snapshot.layers[0]?.id || "");
        setSecondLayerId(snapshot.secondLayerId || "");
        setTableLayerId(snapshot.tableLayerId || null);
        setHistory(snapshot.history as ProcessingHistoryEntry[]);
        setModelNodes(snapshot.modelNodes as ModelNode[]);
        if (snapshot.activeTab) setActiveTab(snapshot.activeTab as MainTab);
        if (snapshot.basemap) setBasemap(snapshot.basemap as BasemapType);

        // Refresh the local offline cache when the cloud copy is newer.
        if (snapshot === cloudSnapshot) {
          void saveGISWorkspaceSnapshot({
            projectId: workspaceProjectId,
            layers: snapshot.layers,
            selectedLayerId: snapshot.selectedLayerId,
            secondLayerId: snapshot.secondLayerId,
            tableLayerId: snapshot.tableLayerId,
            history: snapshot.history,
            modelNodes: snapshot.modelNodes,
            activeTab: snapshot.activeTab,
            basemap: snapshot.basemap,
          });
        }
      } else {
        setLayers([]);
        setSelectedLayerId("");
        setSecondLayerId("");
        setTableLayerId(null);
        setHistory([]);
      }

      hydratedProjectRef.current = workspaceProjectId;
      setWorkspaceHydrated(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceProjectId, cloudUid, activeProject?.id]);

  // Persist project workspace changes without blocking map interaction.
  React.useEffect(() => {
    if (!workspaceHydrated || hydratedProjectRef.current !== workspaceProjectId) return;

    const timer = window.setTimeout(() => {
      const snapshot = {
        projectId: workspaceProjectId,
        layers,
        selectedLayerId,
        secondLayerId,
        tableLayerId,
        history,
        modelNodes,
        activeTab,
        basemap,
      };

      void saveGISWorkspaceSnapshot(snapshot);

      if (cloudUid && activeProject?.id) {
        void syncGISWorkspaceToCloud(cloudUid, snapshot).catch((error) => {
          console.warn("GIS Workspace: cloud sync deferred; local copy is safe:", error);
        });
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    workspaceHydrated,
    workspaceProjectId,
    cloudUid,
    activeProject?.id,
    layers,
    selectedLayerId,
    secondLayerId,
    tableLayerId,
    history,
    modelNodes,
    activeTab,
    basemap,
  ]);


  // Spatial SQL Workspace
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);

  // Swipe Comparator
  const [swipePercent, setSwipePercent] = useState<number>(50);
  const isDraggingRef = useRef(false);

  // Active layer references
  const activeLayer = useMemo(() => layers.find((l) => l.id === selectedLayerId), [layers, selectedLayerId]);
  const secondaryLayer = useMemo(() => layers.find((l) => l.id === secondLayerId), [layers, secondLayerId]);

  // Current selected tool metadata
  const currentTool = useMemo(
    () => GEOPROCESSING_TOOLS_CATALOG.find((t) => t.id === selectedToolId) || GEOPROCESSING_TOOLS_CATALOG[0],
    [selectedToolId]
  );

  // Filtered tools catalog
  const filteredTools = useMemo(() => {
    return GEOPROCESSING_TOOLS_CATALOG.filter((tool) => {
      const matchSearch =
        tool.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
        tool.description.toLowerCase().includes(toolSearch.toLowerCase());
      const matchCat = toolCategoryFilter === "all" || tool.category === toolCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [toolSearch, toolCategoryFilter]);

  const selectedWhiteboxTool = useMemo(
    () => whiteboxTools.find((tool) => tool.id === selectedWhiteboxToolId) ?? null,
    [whiteboxTools, selectedWhiteboxToolId]
  );

  const selectedWhiteboxSupport = useMemo(
    () => (selectedWhiteboxTool ? whiteboxVectorSupport(selectedWhiteboxTool) : null),
    [selectedWhiteboxTool]
  );

  const filteredWhiteboxTools = useMemo(() => {
    const needle = toolSearch.trim().toLowerCase();
    return whiteboxTools.filter((tool) => {
      const category = (tool.category ?? "Outras").toLowerCase();
      const matchesCategory =
        toolCategoryFilter === "all" || category === toolCategoryFilter.toLowerCase();
      const text = [
        tool.id,
        whiteboxManifestName(tool),
        tool.summary ?? "",
        tool.category ?? "",
        tool.source ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!needle || text.includes(needle));
    });
  }, [whiteboxTools, toolSearch, toolCategoryFilter]);

  const whiteboxCategories = useMemo(
    () =>
      Array.from(
        new Set(
          whiteboxTools
            .map((tool) => tool.category)
            .filter((category): category is string => Boolean(category))
        )
      )
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 24),
    [whiteboxTools]
  );

  React.useEffect(() => {
    if (activeTab !== "whitebox_toolbox" || whiteboxTools.length > 0 || whiteboxLoading) return;

    let cancelled = false;
    setWhiteboxLoading(true);
    setWhiteboxError(null);

    void listWhiteboxWasmManifests()
      .then((tools) => {
        if (cancelled) return;
        setWhiteboxTools(tools);
        const first = tools.find((tool) => whiteboxVectorSupport(tool).supported) ?? tools[0];
        if (first) {
          setSelectedWhiteboxToolId(first.id);
          setWhiteboxParams(whiteboxManifestDefaults(first));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setWhiteboxError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setWhiteboxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, whiteboxTools.length, whiteboxLoading]);

  // Synchronize drawn AOI as a layer
  React.useEffect(() => {
    const rawGeometry = aoi?.geometry;
    if (aoi && aoi.source === "draw" && rawGeometry && "coordinates" in rawGeometry) {
      const geometry = rawGeometry as GeoJSON.Geometry;
      const drawnId = "drawn_aoi_layer";
      const fc: FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { nome: aoi.label || "Área Desenhada" },
            geometry,
          },
        ],
      };

      setLayers((prev) => {
        const filtered = prev.filter((l) => l.id !== drawnId);
        return [
          {
            id: drawnId,
            name: aoi.label || "Área Desenhada",
            geojson: fc,
            featureCount: 1,
            geometryType: geometry.type,
            fields: ["nome"],
            color: "#e11d48",
            visible: true,
          },
          ...filtered,
        ];
      });

      if (!selectedLayerId) setSelectedLayerId(drawnId);
    }
  }, [aoi, selectedLayerId]);

  // Default SQL when layer loads
  React.useEffect(() => {
    if (layers.length > 0 && !sqlQuery) {
      setSqlQuery(`SELECT * FROM ${sanitizeDuckDbTableName(layers[0].name)} LIMIT 50`);
    }
  }, [layers, sqlQuery]);

  // ── Handle File Upload ───────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        const duckDbFormats = new Set([
          "gpkg",
          "geoparquet",
          "parquet",
          "pq",
          "fgb",
          "gml",
          "dxf",
          "shp",
          "zip",
        ]);
        const parsed = duckDbFormats.has(extension)
          ? await importVectorFileWithDuckDb(file)
          : await parseUserUploadedFile(file);
        const newLayer: UserLayer = {
          id: `layer_${Date.now()}_${i}`,
          name: parsed.name,
          geojson: parsed.geojson,
          featureCount: parsed.featureCount,
          geometryType: parsed.geometryType,
          fields: parsed.fields,
          color: PALETTE[layers.length % PALETTE.length],
          visible: true,
        };

        setLayers((prev) => [newLayer, ...prev]);
        setSelectedLayerId(newLayer.id);

        toast({
          title: "Ficheiro Carregado",
          description: `${parsed.name} (${parsed.featureCount} elementos) · ${
            duckDbFormats.has(extension) ? "DuckDB Spatial" : "parser local"
          }.`,
        });
      } catch (err: any) {
        toast({
          title: "Falha na Leitura do Ficheiro",
          description: err.message || "Formato de ficheiro inválido.",
          variant: "destructive",
        });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Run Geoprocessing Tool ───────────────────────────────────────────────
  const executeToolById = useCallback(
    (toolId: string, inputFc: FeatureCollection, params: Record<string, any>, overlayFc?: FeatureCollection) => {
      switch (toolId) {
        case "vector_buffer":
          return runVectorBuffer(inputFc, Number(params.distance || 1000), params.units || "meters", Boolean(params.dissolve));
        case "vector_centroids":
          return runVectorCentroids(inputFc);
        case "vector_convexhull":
          return runVectorConvexHull(inputFc);
        case "vector_bbox":
          return runVectorBBox(inputFc);
        case "vector_dissolve":
          return runVectorDissolve(inputFc, params.propertyName);
        case "vector_simplify":
          return runVectorSimplify(inputFc, Number(params.tolerance || 0.005), Boolean(params.highQuality ?? true));
        case "vector_explode":
          return runVectorExplode(inputFc);
        case "vector_calc_metrics":
          return runVectorMetrics(inputFc);
        case "vector_intersect":
          if (!overlayFc) throw new Error("A segunda camada é obrigatória para interseção espacial.");
          return runVectorIntersect(inputFc, overlayFc);
        case "vector_difference":
          if (!overlayFc) throw new Error("A segunda camada é obrigatória para diferença espacial.");
          return runVectorDifference(inputFc, overlayFc);
        case "vector_points_in_poly":
          if (!overlayFc) throw new Error("A segunda camada de polígonos/pontos é obrigatória.");
          return runVectorPointsInPolygon(inputFc, overlayFc);
        default:
          throw new Error(`A ferramenta "${toolId}" ainda não possui um executor compatível com este workspace vetorial.`);
      }
    },
    []
  );

  const handleRunTool = useCallback(() => {
    if (currentTool.implemented === false) {
      toast({
        title: "Ferramenta raster ainda não ligada",
        description: "Este algoritmo requer um motor raster/DEM. Ele permanece catalogado, mas não será executado como uma operação vetorial incorreta.",
        variant: "destructive",
      });
      return;
    }

    if (!activeLayer) {
      toast({
        title: "Selecione uma Camada",
        description: "Carregue um ficheiro GeoJSON/CSV ou escolha uma camada ativa.",
        variant: "destructive",
      });
      return;
    }

    if (currentTool.requiresSecondLayer && !secondaryLayer) {
      toast({
        title: "Segunda Camada Necessária",
        description: "Selecione a camada de sobreposição/corte.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    setTimeout(() => {
      try {
        const { result, stats } = executeToolById(
          selectedToolId,
          activeLayer.geojson,
          toolParams,
          secondaryLayer?.geojson
        );

        const resultId = `result_${Date.now()}`;
        const newLayer: UserLayer = {
          id: resultId,
          name: `${currentTool.name} — ${activeLayer.name}`,
          geojson: result,
          featureCount: result.features.length,
          geometryType: stats.geometryType,
          fields: result.features[0]?.properties ? Object.keys(result.features[0].properties) : [],
          color: PALETTE[(layers.length + 1) % PALETTE.length],
          visible: true,
          isResult: true,
        };

        setLayers((prev) => [newLayer, ...prev]);
        setSelectedLayerId(resultId);

        // Record in Processing History
        const historyEntry: ProcessingHistoryEntry = {
          id: `hist_${Date.now()}`,
          toolId: currentTool.id,
          toolName: currentTool.name,
          engine: "Client (Turf.js)",
          timestamp: new Date().toLocaleTimeString("pt-PT"),
          durationMs: stats.executionTimeMs,
          inputLayerName: activeLayer.name,
          outputCount: result.features.length,
          status: "success",
          parameters: { ...toolParams },
        };
        setHistory((prev) => [historyEntry, ...prev]);

        toast({
          title: "Operação Concluída com Sucesso",
          description: stats.summary,
        });
      } catch (err: any) {
        toast({
          title: "Erro na Execução",
          description: err.message || "Falha na computação espacial.",
          variant: "destructive",
        });
      } finally {
        setIsExecuting(false);
      }
    }, 25);
  }, [activeLayer, secondaryLayer, currentTool, selectedToolId, toolParams, layers, executeToolById, toast]);

  // ── Run Model Builder Chain ──────────────────────────────────────────────
  const handleRunModel = useCallback(() => {
    if (!activeLayer) {
      toast({
        title: "Camada de Entrada Necessária",
        description: "Selecione a camada inicial para alimentar o fluxo do modelo.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    setTimeout(() => {
      let currentFc = activeLayer.geojson;
      const t0 = performance.now();

      try {
        for (const node of modelNodes) {
          const { result } = executeToolById(node.toolId, currentFc, node.parameters);
          currentFc = result;
        }

        const duration = Math.round(performance.now() - t0);
        const resultId = `model_result_${Date.now()}`;
        const newLayer: UserLayer = {
          id: resultId,
          name: `Modelo Encadeado (${modelNodes.length} passos) — ${activeLayer.name}`,
          geojson: currentFc,
          featureCount: currentFc.features.length,
          geometryType: currentFc.features[0]?.geometry?.type || "Polygon",
          fields: currentFc.features[0]?.properties ? Object.keys(currentFc.features[0].properties) : [],
          color: "#9333ea",
          visible: true,
          isResult: true,
        };

        setLayers((prev) => [newLayer, ...prev]);
        setSelectedLayerId(resultId);

        toast({
          title: "Fluxo do Modelo Executado com Sucesso",
          description: `${modelNodes.length} etapas processadas em sequência em ${duration}ms.`,
        });
      } catch (err: any) {
        toast({
          title: "Falha na Execução do Modelo",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsExecuting(false);
      }
    }, 30);
  }, [activeLayer, modelNodes, executeToolById, toast]);

  const handleRunWhitebox = useCallback(async () => {
    if (!selectedWhiteboxTool || !selectedWhiteboxSupport?.supported) {
      toast({
        title: "Ferramenta ainda não ligada ao tipo de camada",
        description:
          selectedWhiteboxSupport?.reason ||
          "Selecione uma ferramenta Whitebox vetorial compatível.",
        variant: "destructive",
      });
      return;
    }
    if (!activeLayer) {
      toast({
        title: "Selecione uma camada",
        description: "A ferramenta Whitebox precisa de uma camada vetorial de entrada.",
        variant: "destructive",
      });
      return;
    }
    if (selectedWhiteboxSupport.vectorInputs.length > 1 && !secondaryLayer) {
      toast({
        title: "Segunda camada necessária",
        description: "Esta ferramenta Whitebox declara duas entradas vetoriais.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {
      const result = await runWhiteboxVectorTool({
        manifest: selectedWhiteboxTool,
        primaryLayer: activeLayer.geojson,
        secondaryLayer: secondaryLayer?.geojson,
        parameters: whiteboxParams,
      });

      const generated: UserLayer[] = result.outputs.map((output, index) => {
        const geojson = output.geojson;
        return {
          id: `whitebox_${Date.now()}_${index}`,
          name: `${whiteboxManifestName(selectedWhiteboxTool)} — ${output.parameter}`,
          geojson,
          featureCount: geojson.features.length,
          geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
          fields: geojson.features[0]?.properties
            ? Object.keys(geojson.features[0].properties)
            : [],
          color: PALETTE[(layers.length + index + 1) % PALETTE.length],
          visible: true,
          isResult: true,
        };
      });

      setLayers((previous) => [...generated, ...previous]);
      if (generated[0]) setSelectedLayerId(generated[0].id);

      const outputCount = generated.reduce(
        (total, layer) => total + layer.featureCount,
        0
      );
      setHistory((previous) => [
        {
          id: `hist_whitebox_${Date.now()}`,
          toolId: selectedWhiteboxTool.id,
          toolName: whiteboxManifestName(selectedWhiteboxTool),
          engine: "WASM",
          timestamp: new Date().toLocaleTimeString("pt-PT"),
          durationMs: result.executionTimeMs,
          inputLayerName: [activeLayer.name, secondaryLayer?.name]
            .filter(Boolean)
            .join(", "),
          outputCount,
          status: "success",
          parameters: { ...whiteboxParams },
        },
        ...previous,
      ]);

      toast({
        title: "Whitebox WASM concluído",
        description: `${whiteboxManifestName(selectedWhiteboxTool)} gerou ${outputCount} feições em ${result.executionTimeMs}ms.`,
      });
    } catch (error) {
      toast({
        title: "Whitebox WASM falhou",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  }, [
    activeLayer,
    layers.length,
    secondaryLayer,
    selectedWhiteboxSupport,
    selectedWhiteboxTool,
    toast,
    whiteboxParams,
  ]);

  // ── Execute Spatial SQL (DuckDB-WASM Spatial real) ────────────────────────
  const handleExecuteSql = useCallback(async () => {
    if (layers.length === 0) {
      toast({
        title: "Adicione Dados",
        description: "Carregue pelo menos uma camada vetorial antes de executar SQL espacial.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    const startedAt = performance.now();
    try {
      const res = await executeDuckDbSpatialQuery(
        layers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          geojson: layer.geojson,
        })),
        sqlQuery
      );
      setSqlResult(res);

      if (res.features && res.features.length > 0) {
        const sqlLayerId = `sql_${Date.now()}`;
        const newLayer: UserLayer = {
          id: sqlLayerId,
          name: `SQL Spatial (${res.features.length})`,
          geojson: { type: "FeatureCollection", features: res.features },
          featureCount: res.features.length,
          geometryType: res.features[0]?.geometry?.type || "Geometry",
          fields: res.columns.filter((column) => column.toLowerCase() !== "geom"),
          color: "#0891b2",
          visible: true,
          isResult: true,
        };
        setLayers((prev) => [newLayer, ...prev]);
        setSelectedLayerId(sqlLayerId);
      }

      const historyEntry: ProcessingHistoryEntry = {
        id: `hist_sql_${Date.now()}`,
        toolId: "duckdb_spatial_sql",
        toolName: "DuckDB Spatial SQL",
        engine: "DuckDB Spatial",
        timestamp: new Date().toLocaleTimeString("pt-PT"),
        durationMs: Math.round(performance.now() - startedAt),
        inputLayerName: layers.map((layer) => layer.name).join(", "),
        outputCount: res.features?.length ?? res.rows.length,
        status: "success",
        parameters: { sql: sqlQuery },
      };
      setHistory((prev) => [historyEntry, ...prev]);

      toast({
        title: "DuckDB Spatial concluído",
        description: `${res.rows.length} linhas em ${res.executionTimeMs}ms · ${res.tableNames.length} tabela(s) disponíveis.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro no DuckDB Spatial",
        description: err?.message || "Não foi possível executar a consulta espacial.",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  }, [layers, sqlQuery, toast]);

  // ── Swipe Drag Handler ───────────────────────────────────────────────────
  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true;
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !mapContainerRef.current) return;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const pct = Math.round((x / rect.width) * 100);
      setSwipePercent(pct);
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  // ── Export PDF Report ────────────────────────────────────────────────────
  const exportPdf = () => {
    const reportTitle = "Dossiê Avançado de Geoprocessamento";
    const ctx = createPDFContext(reportTitle);
    drawCover(
      ctx,
      `GeoLibre Processing Engine — ${province ?? "Moçambique"} · Dados Próprios`,
      [
        `Província: ${province ?? "Nacional"}`,
        `Camadas: ${layers.length}`,
        `Operações: ${history.length}`,
        "Execução: Turf.js local",
      ]
    );

    sectionTitle(ctx, "Histórico Cronológico de Execução");
    if (history.length > 0) {
      drawTable(
        ctx,
        ["Ferramenta", "Entrada", "Saída", "Duração", "Estado"],
        history.slice(0, 10).map((h) => ({
          cells: [h.toolName, h.inputLayerName, `${h.outputCount} feições`, `${h.durationMs} ms`, h.status.toUpperCase()],
          color: h.status === "success" ? "#16a34a" : "#dc2626",
        })),
        [CONTENT_W * 0.3, CONTENT_W * 0.25, CONTENT_W * 0.18, CONTENT_W * 0.15, CONTENT_W * 0.12]
      );
    }

    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_Geoprocessamento_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "Dossiê Gerado", description: "Relatório técnico PDF descarregado." });
  };

  // Dashboard Chart Data
  const chartData = useMemo(() => {
    if (!activeLayer || activeLayer.geojson.features.length === 0) return [];
    // Aggregate by first string column or geometry type
    const field = activeLayer.fields[0];
    const counts = new Map<string, number>();

    for (const f of activeLayer.geojson.features) {
      const val = field ? String(f.properties?.[field] ?? "Outros") : f.geometry.type;
      counts.set(val, (counts.get(val) || 0) + 1);
    }

    return Array.from(counts.entries())
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [activeLayer]);

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-950 relative font-sans">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".geojson,.json,.csv,.kml,.gml,.gpkg,.parquet,.geoparquet,.pq,.fgb,.dxf,.shp,.zip"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[650] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar: Full Processing Menu Layout ─────────────────────────── */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-[700] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 transition-all duration-300 shadow-xl md:shadow-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${desktopSidebarOpen ? "md:w-96 overflow-y-auto" : "md:w-0 overflow-hidden md:border-r-0"}`}
      >
        {/* Processing Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Wrench size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Processing Tools</h2>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  GeoLibre Core
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Mapa GIS · Toolbox · Model Builder · Spatial SQL · Histórico</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Processing Menu Tabs */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold">
            <button
              onClick={() => setActiveTab("geolibre_toolbox")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "geolibre_toolbox"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Wrench size={12} />
              <span>GeoLibre</span>
            </button>
            <button
              onClick={() => setActiveTab("whitebox_toolbox")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "whitebox_toolbox"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Boxes size={12} />
              <span>Whitebox</span>
            </button>
            <button
              onClick={() => setActiveTab("model_builder")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "model_builder"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Workflow size={12} />
              <span>Modeler</span>
            </button>
            <button
              onClick={() => setActiveTab("sql_workspace")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "sql_workspace"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Database size={12} />
              <span>SQL</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 mt-1 text-[10px] font-semibold">
            <button
              onClick={() => setActiveTab("layers")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "layers"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Layers size={12} />
              <span>Camadas ({layers.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "dashboard"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <BarChart3 size={12} />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "history"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <History size={12} />
              <span>Histórico</span>
            </button>
            <button
              onClick={() => setActiveTab("swipe")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "swipe"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Columns2 size={12} />
              <span>Cortina</span>
            </button>
          </div>
        </div>

        {/* ── Sub-Section 1: GeoLibre Toolbox ──────────────────────────────── */}
        {activeTab === "geolibre_toolbox" && (
          <div className="p-3 space-y-3 flex-1">
            {layers.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center space-y-3 bg-slate-50/50 dark:bg-slate-800/20">
                <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
                  <Upload size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Carregue os Seus Dados Para Processar
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    GeoJSON (.geojson), CSV com coordenadas ou KML (.kml).
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Selecionar Ficheiro do Computador
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Input Layer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Camada de Entrada (Input Layer)
                    </label>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Plus size={10} /> Novo Ficheiro
                    </button>
                  </div>
                  <select
                    value={selectedLayerId}
                    onChange={(e) => setSelectedLayerId(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.featureCount} {l.geometryType})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Second Layer if required */}
                {currentTool.requiresSecondLayer && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Camada de Corte / Sobreposição
                    </label>
                    <select
                      value={secondLayerId}
                      onChange={(e) => setSecondLayerId(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">Selecione a camada de sobreposição...</option>
                      {layers
                        .filter((l) => l.id !== selectedLayerId)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.featureCount} {l.geometryType})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Tool Selector */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Ferramenta GeoLibre
                  </label>
                  <select
                    value={selectedToolId}
                    onChange={(e) => setSelectedToolId(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <optgroup label="Geometria">
                      <option value="vector_buffer">Buffer (Zona de Amortecimento)</option>
                      <option value="vector_centroids">Calcular Centróides</option>
                      <option value="vector_convexhull">Envelope Convexo (Convex Hull)</option>
                      <option value="vector_bbox">Caixa Envolvente (Bounding Box)</option>
                      <option value="vector_dissolve">Dissolver Polígonos</option>
                      <option value="vector_simplify">Simplificar Geometria</option>
                      <option value="vector_explode">Extrair Vértices (Explode)</option>
                    </optgroup>
                    <optgroup label="Sobreposição">
                      <option value="vector_intersect">Interseção Espacial (Clip / Intersect)</option>
                      <option value="vector_points_in_poly">Pontos em Polígonos</option>
                    </optgroup>
                    <optgroup label="Atributos">
                      <option value="vector_calc_metrics">Calcular Área e Perímetro Geodésico</option>
                    </optgroup>
                  </select>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {currentTool.description}
                  </p>
                </div>

                {/* Engine Selector */}
                <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">Motor de Execução:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    <span>Client (Turf.js)</span>
                  </span>
                </div>

                {/* Parameters Form */}
                {currentTool.parameters.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Parâmetros da Ferramenta
                    </span>
                    {currentTool.parameters.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                          <span>{p.label}</span>
                          {p.type === "number" && (
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                              {toolParams[p.name] ?? p.default}
                            </span>
                          )}
                        </div>
                        {p.type === "number" && (
                          <input
                            type="range"
                            min={p.min ?? 0}
                            max={p.max ?? 100}
                            step={p.step ?? 1}
                            value={toolParams[p.name] ?? p.default}
                            onChange={(e) => setToolParams((prev) => ({ ...prev, [p.name]: +e.target.value }))}
                            className="w-full accent-indigo-600"
                          />
                        )}
                        {p.type === "select" && (
                          <select
                            value={toolParams[p.name] ?? p.default}
                            onChange={(e) => setToolParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                            className="w-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-1.5"
                          >
                            {p.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {p.type === "boolean" && (
                          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={toolParams[p.name] ?? p.default}
                              onChange={(e) => setToolParams((prev) => ({ ...prev, [p.name]: e.target.checked }))}
                              className="accent-indigo-600 rounded"
                            />
                            <span>Ativar</span>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Execute Button */}
                <button
                  onClick={handleRunTool}
                  disabled={isExecuting || !activeLayer || currentTool.implemented === false}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>A computar no navegador...</span>
                    </>
                  ) : currentTool.implemented === false ? (
                    <>
                      <AlertCircle size={14} />
                      <span>Requer motor raster</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      <span>Executar {currentTool.name}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Sub-Section 2: Whitebox Toolbox ──────────────────────────────── */}
        {activeTab === "whitebox_toolbox" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 rounded-xl p-2.5 text-[11px] text-sky-900 dark:text-sky-300">
              <span className="font-semibold block mb-0.5">Catálogo Whitebox Tools</span>
              Navegue pelas centenas de algoritmos disponíveis para hidrologia, relevo, sensoriamento e conversão.
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="Pesquisar ferramentas Whitebox..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-1 overflow-x-auto pb-1 text-[10px]">
              {[
                { id: "all", label: "Todas" },
                { id: "vector_geom", label: "Vetor" },
                { id: "terrain", label: "Terreno" },
                { id: "hydrology", label: "Hidrologia" },
                { id: "spectral", label: "Radar/Sensoriamento" },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setToolCategoryFilter(c.id)}
                  className={`px-2 py-1 rounded-md shrink-0 transition-colors ${
                    toolCategoryFilter === c.id
                      ? "bg-indigo-600 text-white font-bold"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Filtered Tools List */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filteredTools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedToolId(t.id);
                    setActiveTab("geolibre_toolbox");
                  }}
                  className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer ${
                    selectedToolId === t.id
                      ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{t.name}</span>
                    <span className={`text-[9px] px-1 rounded ${t.implemented === false ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                      {t.implemented === false ? "Requer raster" : t.categoryLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Sub-Section 3: Model Builder ─────────────────────────────────── */}
        {activeTab === "model_builder" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 rounded-xl p-2.5 text-[11px] text-purple-900 dark:text-purple-300">
              <span className="font-semibold block mb-0.5">Model Builder (Fluxo em Cadeia)</span>
              Encadeie operações em sequência para execução automatizada sobre a camada de entrada.
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300">
                <Layers size={14} className="text-indigo-600" />
                <span>Entrada: {activeLayer?.name || "Nenhuma camada selecionada"}</span>
              </div>

              {modelNodes.map((node, idx) => (
                <div key={node.id} className="relative flex flex-col items-center">
                  <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-700" />
                  <div className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span>Passo {idx + 1}: {node.name}</span>
                      <button
                        onClick={() => setModelNodes((prev) => prev.filter((n) => n.id !== node.id))}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() =>
                  setModelNodes((prev) => [
                    ...prev,
                    {
                      id: `node_${Date.now()}`,
                      toolId: "vector_simplify",
                      name: "Simplificar Geometria",
                      parameters: { tolerance: 0.005 },
                    },
                  ])
                }
                className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Adicionar Etapa
              </button>
              <button
                onClick={handleRunModel}
                disabled={isExecuting || !activeLayer}
                className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Play size={12} /> Executar Fluxo
              </button>
            </div>
          </div>
        )}

        {/* ── Sub-Section 4: SQL Workspace ─────────────────────────────────── */}
        {activeTab === "sql_workspace" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl p-2.5 text-[11px] text-amber-900 dark:text-amber-300">
              <span className="font-semibold block mb-0.5">DuckDB-WASM Spatial · Motor real</span>
              Todas as camadas carregadas são tabelas SQL. Use funções ST_* para análise espacial, joins e geometrias derivadas.
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Consulta SQL
              </label>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                className="w-full text-xs font-mono bg-slate-900 text-amber-300 rounded-lg p-2.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              onClick={() => void handleExecuteSql()}
              disabled={isExecuting || layers.length === 0}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
              <span>{isExecuting ? "A executar DuckDB…" : "Executar DuckDB Spatial"}</span>
            </button>

            {sqlResult && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Resultados ({sqlResult.rows.length} registos)
                  </span>
                  <span className="text-[10px] text-slate-400">{sqlResult.executionTimeMs} ms</span>
                </div>
                <div className="max-h-40 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-[10px]">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0">
                      <tr>
                        {sqlResult.columns.map((c) => (
                          <th key={c} className="p-1.5 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sqlResult.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {sqlResult.columns.map((c) => (
                            <td key={c} className="p-1.5 text-slate-700 dark:text-slate-300">
                              {String(r[c] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => exportToCsv(sqlResult.rows, "resultado_sql.csv")}
                  className="w-full py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download size={11} /> Exportar CSV da Consulta
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Sub-Section 5: Dashboard Analítico ────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-2.5 text-[11px] text-emerald-900 dark:text-emerald-300">
              <span className="font-semibold block mb-0.5">Dashboard da Camada Ativa</span>
              Gráficos de distribuição analítica baseados nos atributos reais carregados.
            </div>

            {chartData.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Distribuição por Categoria
                  </span>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <RechartsTooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                        <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 block">Total de Feições</span>
                    <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {activeLayer?.featureCount ?? 0}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 block">Campos de Atributos</span>
                    <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {activeLayer?.fields.length ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                Selecione uma camada com feições para gerar gráficos analíticos.
              </div>
            )}
          </div>
        )}

        {/* ── Sub-Section 6: Histórico ─────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Histórico de Execuções ({history.length})
              </span>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="text-[10px] text-red-600 hover:underline cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                Nenhuma ferramenta executada nesta sessão.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>{h.toolName}</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{h.durationMs} ms</span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>Entrada: {h.inputLayerName}</span>
                      <span>{h.timestamp}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Gerou {h.outputCount} feições via {h.engine}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Sub-Section 7: Camadas ───────────────────────────────────────── */}
        {activeTab === "layers" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Camadas no Mapa ({layers.length})
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-1 px-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Upload size={11} /> Importar
              </button>
            </div>

            <div className="space-y-2">
              {layers.map((l) => (
                <div
                  key={l.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    selectedLayerId === l.id
                      ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
                      <span
                        onClick={() => setSelectedLayerId(l.id)}
                        className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate cursor-pointer hover:text-indigo-600"
                      >
                        {l.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setLayers((prev) =>
                            prev.map((item) => (item.id === l.id ? { ...item, visible: !item.visible } : item))
                          )
                        }
                        className="p-1 text-slate-400 hover:text-slate-700"
                      >
                        {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        onClick={() => setTableLayerId(l.id)}
                        className="p-1 text-slate-400 hover:text-indigo-600"
                        title="Ver tabela"
                      >
                        <Table size={13} />
                      </button>
                      <button
                        onClick={() => exportToGeoJson(l.geojson.features, `${l.name}.geojson`)}
                        className="p-1 text-slate-400 hover:text-emerald-600"
                        title="Exportar GeoJSON"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => setLayers((prev) => prev.filter((item) => item.id !== l.id))}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{l.featureCount} feições</span>
                    <span>·</span>
                    <span>{l.geometryType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sub-Section 8: Cortina Swipe ─────────────────────────────────── */}
        {activeTab === "swipe" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 rounded-xl p-2.5 text-[11px] text-sky-900 dark:text-sky-300">
              <span className="font-semibold block mb-0.5">Cortina Deslizante</span>
              Arraste a linha no centro do mapa para comparar duas camadas sobrepostas.
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">Posição:</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">{swipePercent}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={swipePercent}
                onChange={(e) => setSwipePercent(+e.target.value)}
                className="w-full accent-sky-500"
              />
            </div>
          </div>
        )}

        {/* Footer: Export Dossiê PDF */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={exportPdf}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            <FileDown size={14} />
            <span>Exportar Dossiê de Processamento PDF</span>
          </button>
        </div>
      </div>

      {/* Desktop Collapse Toggle */}
      <button
        type="button"
        onClick={() => setDesktopSidebarOpen((v) => !v)}
        style={{ left: desktopSidebarOpen ? "24rem" : "0px" }}
        title={desktopSidebarOpen ? "Recolher painel" : "Expandir painel"}
        className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
      >
        {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* ── Main MapLibre GIS Workspace View ─────────────────────────────── */}
      <div className="flex-1 relative flex flex-col" ref={mapContainerRef}>
        {/* Mobile floating toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="md:hidden absolute top-3 left-3 z-[600] flex items-center gap-1.5 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
        >
          <SlidersHorizontal size={13} className="text-indigo-600" />
          <span>Ferramentas</span>
        </button>

        <GISWorkspaceMapLibre
          layers={layers}
          activeLayerId={selectedLayerId}
          basemap={basemap}
          aoiGeometry={aoi.source !== "global" ? aoi.geometry : null}
          drawingEnabled={drawingEnabled}
          onSelectLayer={setSelectedLayerId}
          onDrawComplete={(geometry, label) => {
            setDrawingEnabled(false);
            onAOIChange(customAOI(geometry, label, "draw"));
          }}
          onDrawCancel={() => {
            setDrawingEnabled(false);
          }}
        />

        {/* ── Swipe Vertical Divider ──────────────────────────────────────── */}
        {activeTab === "swipe" && (
          <div
            className="absolute top-0 bottom-0 z-[600] w-1 bg-white cursor-ew-resize select-none pointer-events-auto shadow-2xl flex items-center justify-center"
            style={{ left: `${swipePercent}%` }}
            onMouseDown={handleMouseDown}
          >
            <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 shadow-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 cursor-ew-resize">
              <Columns2 size={16} />
            </div>
          </div>
        )}

        <BasemapSwitcher
          current={basemap}
          onChange={setBasemap}
          className="absolute bottom-16 sm:bottom-6 left-4 z-[600]"
          position="bottom-left"
        />

        {/* ── Attribute Table Drawer ──────────────────────────────────────── */}
        {tableLayerId && (
          <div className="absolute bottom-0 left-0 right-0 z-[650] max-h-60 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table size={14} className="text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Tabela de Atributos — {layers.find((l) => l.id === tableLayerId)?.name}
                </span>
              </div>
              <button
                onClick={() => setTableLayerId(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {(() => {
                const layer = layers.find((l) => l.id === tableLayerId);
                if (!layer || layer.geojson.features.length === 0) return null;
                const fields = layer.fields;
                return (
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0">
                      <tr>
                        {fields.map((f) => (
                          <th key={f} className="p-1.5 font-semibold">
                            {f}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {layer.geojson.features.slice(0, 100).map((feat, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {fields.map((f) => (
                            <td key={f} className="p-1.5 text-slate-700 dark:text-slate-300">
                              {String(feat.properties?.[f] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

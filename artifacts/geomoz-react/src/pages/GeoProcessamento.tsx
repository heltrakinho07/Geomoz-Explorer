/**
 * GeoMoz GIS Workspace — ambiente GIS integrado e persistente.
 *
 * Engines: Turf.js for verified vector tools, DuckDB-WASM Spatial for SQL,
 * Whitebox WASM for a curated geoprocessing catalog, and MapLibre for mapping.
 * The UI only exposes execution paths that GeoMoz can configure explicitly.
 */

import React, { useState, useRef, useMemo, useCallback } from "react";
import GISWorkspaceMapLibre from "@/components/GISWorkspaceMapLibre";
import GISModelBuilderPanel from "@/components/GISModelBuilderPanel";
import {
  fetchWfsCapabilities,
  importWfsFeatureType,
  type WfsFeatureType,
} from "@/lib/ogc-wfs";
import {
  connectOgcApiFeatures,
  importOgcApiFeatures,
  type OgcApiFeaturesConnection,
} from "@/lib/ogc-api-features";
import {
  compatibleWmtsMatrixSets,
  createServiceLayer,
  createWmsTileUrl,
  createWmtsTileUrl,
  fetchRemoteGeoJson,
  fetchWmsCapabilities,
  fetchWmtsCapabilities,
  validateXyzTemplate,
  type GISWorkspaceServiceLayer,
  type WmsCapabilities,
  type WmtsCapabilities,
} from "@/lib/gis-data-sources";
import {
  EARTH_SEARCH_STAC,
  PLANETARY_COMPUTER_STAC,
  connectStacApi,
  searchStacItems,
  stacItemDate,
  stacRasterAssets,
  type GISStacAsset,
  type GISStacConnection,
  type GISStacItem,
} from "@/lib/stac-client";
import {
  inspectRemotePMTiles,
  type GISPMTilesInfo,
} from "@/lib/gis-pmtiles";
import { bbox as turfBbox } from "@turf/turf";
import {
  createGISHeavyJob,
  deleteGISHeavyJob,
  downloadGISHeavyJobResult,
  waitForGISHeavyJob,
  type GISHeavyProcessingJob,
  type GISHeavyToolId,
} from "@/lib/gis-processing-jobs";
import {
  autoGISRasterStretch,
  getGISRasterBandStats,
  resolveGISRasterRemoteUrl,
  type GISRasterBandStats,
  type GISWorkspaceRasterLayer,
  type GISWorkspaceRasterMetadata,
} from "@/lib/gis-raster";
import {
  computeGISRasterBreaks,
  defaultGISRasterSymbology,
  rasterClassColors,
  type GISRasterSymbology,
} from "@/lib/gis-raster-classification";
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
  Link2,
  Globe2,
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
  importShapefileBundleWithDuckDb,
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
  loadGISWorkspaceRasterFiles,
  syncGISWorkspaceRasterFiles,
  type PersistedGISRasterLayer,
} from "@/lib/gis-workspace-persistence";
import {
  listWhiteboxWasmManifests,
  runWhiteboxRasterTool,
  runWhiteboxVectorTool,
  whiteboxManifestDefaults,
  whiteboxManifestName,
  whiteboxParamKind,
  whiteboxRasterSupport,
  whiteboxVectorSupport,
  type WhiteboxWasmManifest,
} from "@/lib/whitebox-wasm";
import {
  buildGISModelToolCatalog,
  createDefaultGISModelGraph,
  runGISModelGraph,
  validateGISModelGraph,
  type GISModelGraph,
  type GISModelValue,
} from "@/lib/gis-model-graph";

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
  engine:
    | "Client (Turf.js)"
    | "WASM"
    | "DuckDB Spatial"
    | "Hybrid Model"
    | "Backend GDAL";
  timestamp: string;
  durationMs: number;
  inputLayerName: string;
  outputCount: number;
  outputLabel?: string;
  status: "success" | "error";
  parameters: Record<string, any>;
}

type MainTab =
  | "data_sources"
  | "vector_toolbox"
  | "whitebox_toolbox"
  | "model_builder"
  | "sql_workspace"
  | "dashboard"
  | "history"
  | "layers"
;

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

function rasterStatsKey(layerId: string, band: number): string {
  return `${layerId}:${band}`;
}

function formatRasterValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if ((abs > 0 && abs < 0.001) || abs >= 1_000_000) return value.toExponential(3);
  return Number(value.toPrecision(6)).toLocaleString("pt-PT");
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rasterErrorToastRef = useRef(new Set<string>());

  // Main UI Navigation
  const [activeTab, setActiveTab] = useState<MainTab>("vector_toolbox");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  // User Layers
  const [layers, setLayers] = useState<UserLayer[]>([]);
  const [rasterLayers, setRasterLayers] = useState<GISWorkspaceRasterLayer[]>([]);
  const [rasterUrl, setRasterUrl] = useState("");
  const [showRasterUrlInput, setShowRasterUrlInput] = useState(false);
  const [rasterBandStats, setRasterBandStats] = useState<Record<string, GISRasterBandStats>>({});
  const [rasterStatsLoadingKey, setRasterStatsLoadingKey] = useState<string | null>(null);
  const [rasterStatsErrors, setRasterStatsErrors] = useState<Record<string, string>>({});
  const [serviceLayers, setServiceLayers] = useState<GISWorkspaceServiceLayer[]>([]);
  const [remoteGeoJsonUrl, setRemoteGeoJsonUrl] = useState("");
  const [remoteVectorLoading, setRemoteVectorLoading] = useState(false);
  const [tileServiceType, setTileServiceType] = useState<"xyz" | "wmts">("xyz");
  const [tileServiceName, setTileServiceName] = useState("");
  const [tileServiceUrl, setTileServiceUrl] = useState("");
  const [tileServiceAttribution, setTileServiceAttribution] = useState("");
  const [pmtilesUrl, setPmtilesUrl] = useState("");
  const [pmtilesName, setPmtilesName] = useState("");
  const [pmtilesInfo, setPmtilesInfo] = useState<GISPMTilesInfo | null>(null);
  const [pmtilesSourceLayersText, setPmtilesSourceLayersText] = useState("");
  const [pmtilesLoading, setPmtilesLoading] = useState(false);
  const [wmsEndpoint, setWmsEndpoint] = useState("");
  const [wmsCapabilities, setWmsCapabilities] = useState<WmsCapabilities | null>(null);
  const [wmsSelectedLayer, setWmsSelectedLayer] = useState("");
  const [wmsStyle, setWmsStyle] = useState("");
  const [wmsLoading, setWmsLoading] = useState(false);
  const [wmtsEndpoint, setWmtsEndpoint] = useState("");
  const [wmtsCapabilities, setWmtsCapabilities] = useState<WmtsCapabilities | null>(null);
  const [wmtsSelectedLayer, setWmtsSelectedLayer] = useState("");
  const [wmtsSelectedMatrixSet, setWmtsSelectedMatrixSet] = useState("");
  const [wmtsStyle, setWmtsStyle] = useState("");
  const [wmtsLoading, setWmtsLoading] = useState(false);
  const [stacEndpoint, setStacEndpoint] = useState(PLANETARY_COMPUTER_STAC);
  const [stacConnection, setStacConnection] = useState<GISStacConnection | null>(null);
  const [stacCollection, setStacCollection] = useState("");
  const [stacStartDate, setStacStartDate] = useState("");
  const [stacEndDate, setStacEndDate] = useState("");
  const [stacUseAoi, setStacUseAoi] = useState(true);
  const [stacItems, setStacItems] = useState<GISStacItem[]>([]);
  const [stacAssetChoice, setStacAssetChoice] = useState<Record<string, string>>({});
  const [stacLoading, setStacLoading] = useState(false);
  const [wfsEndpoint, setWfsEndpoint] = useState("");
  const [wfsVersion, setWfsVersion] = useState("2.0.0");
  const [wfsFeatureTypes, setWfsFeatureTypes] = useState<WfsFeatureType[]>([]);
  const [selectedWfsType, setSelectedWfsType] = useState("");
  const [wfsLoading, setWfsLoading] = useState(false);
  const [ogcApiEndpoint, setOgcApiEndpoint] = useState("");
  const [ogcApiConnection, setOgcApiConnection] =
    useState<OgcApiFeaturesConnection | null>(null);
  const [ogcApiCollection, setOgcApiCollection] = useState("");
  const [ogcApiUseAoi, setOgcApiUseAoi] = useState(true);
  const [ogcApiLoading, setOgcApiLoading] = useState(false);
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

  // Real Whitebox / Whitebox WASM catalog (lazy-loaded only when the tab opens).
  const [whiteboxTools, setWhiteboxTools] = useState<WhiteboxWasmManifest[]>([]);
  const [whiteboxLoading, setWhiteboxLoading] = useState(false);
  const [whiteboxError, setWhiteboxError] = useState<string | null>(null);
  const [selectedWhiteboxToolId, setSelectedWhiteboxToolId] = useState("");
  const [whiteboxParams, setWhiteboxParams] = useState<Record<string, unknown>>({});
  const [selectedWhiteboxRasterId, setSelectedWhiteboxRasterId] = useState("");
  const [secondWhiteboxRasterId, setSecondWhiteboxRasterId] = useState("");
  const [heavyJob, setHeavyJob] = useState<GISHeavyProcessingJob | null>(null);
  const heavyJobAbortRef = useRef<AbortController | null>(null);

  // Processing History
  const [history, setHistory] = useState<ProcessingHistoryEntry[]>([]);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const hydratedProjectRef = useRef<string | null>(null);

  // Model Builder — typed DAG (vector + raster).
  const [modelGraph, setModelGraph] = useState<GISModelGraph>(
    createDefaultGISModelGraph
  );
  const [modelNodeStatus, setModelNodeStatus] = useState<
    Record<string, "running" | "done" | "error">
  >({});
  const [modelLog, setModelLog] = useState<string[]>([]);
  const modelAbortRef = useRef<AbortController | null>(null);

  // Restore the newest available workspace snapshot. IndexedDB is the fast
  // offline cache; authenticated projects additionally use Firestore + Storage.
  React.useEffect(() => {
    let cancelled = false;
    setWorkspaceHydrated(false);
    hydratedProjectRef.current = null;

    const load = async () => {
      const localPromise = loadGISWorkspaceSnapshot(workspaceProjectId);
      const rasterFilesPromise = loadGISWorkspaceRasterFiles(workspaceProjectId).catch((error) => {
        console.warn("GIS Workspace: raster cache indisponível:", error);
        return new Map<string, File>();
      });
      const cloudPromise =
        cloudUid && activeProject?.id
          ? loadGISWorkspaceFromCloud(cloudUid, workspaceProjectId).catch((error) => {
              console.warn("GIS Workspace: cloud restore unavailable, using local cache:", error);
              return null;
            })
          : Promise.resolve(null);

      const [localSnapshot, rasterFiles, cloudSnapshot] = await Promise.all([
        localPromise,
        rasterFilesPromise,
        cloudPromise,
      ]);
      if (cancelled) return;

      const localTime = localSnapshot ? Date.parse(localSnapshot.updatedAt) || 0 : 0;
      const cloudTime = cloudSnapshot ? Date.parse(cloudSnapshot.updatedAt) || 0 : 0;
      const snapshot =
        cloudSnapshot && cloudTime > localTime ? cloudSnapshot : localSnapshot ?? cloudSnapshot;

      if (snapshot) {
        setLayers(snapshot.layers as UserLayer[]);
        setServiceLayers(snapshot.services ?? []);
        const rasterMetadata = (snapshot.rasters ?? []) as PersistedGISRasterLayer[];
        setRasterLayers(
          rasterMetadata.flatMap((raster) => {
            const file = rasterFiles.get(raster.id);
            if (!file && !raster.remoteUrl) return [];
            return [
              {
                id: raster.id,
                name: raster.name,
                file,
                remoteUrl: raster.remoteUrl,
                sourceType: raster.sourceType,
                stacSource: raster.stacSource,
                fileName: raster.fileName,
                mimeType: raster.mimeType || "image/tiff",
                sizeBytes: file?.size ?? raster.sizeBytes ?? 0,
                visible: raster.visible,
                opacity: raster.opacity,
                isResult: raster.isResult,
                bandCount: raster.bandCount ?? null,
                bounds: raster.bounds ?? null,
                error: raster.error ?? null,
                rasterState: raster.rasterState as GISWorkspaceRasterLayer["rasterState"],
                rasterSymbology:
                  raster.rasterSymbology as GISWorkspaceRasterLayer["rasterSymbology"],
              } satisfies GISWorkspaceRasterLayer,
            ];
          })
        );
        setSelectedLayerId(snapshot.selectedLayerId || snapshot.layers[0]?.id || "");
        setSecondLayerId(snapshot.secondLayerId || "");
        setTableLayerId(snapshot.tableLayerId || null);
        setHistory(snapshot.history as ProcessingHistoryEntry[]);
        setModelGraph(
          snapshot.modelNodes.length || snapshot.modelEdges.length
            ? {
                version: 1,
                nodes: snapshot.modelNodes,
                edges: snapshot.modelEdges,
              }
            : createDefaultGISModelGraph()
        );
        if (snapshot.activeTab) {
          const supportedTabs: MainTab[] = [
            "data_sources",
            "vector_toolbox",
            "whitebox_toolbox",
            "model_builder",
            "sql_workspace",
            "dashboard",
            "history",
            "layers",
          ];
          setActiveTab(
            supportedTabs.includes(snapshot.activeTab as MainTab)
              ? (snapshot.activeTab as MainTab)
              : "vector_toolbox"
          );
        }
        if (snapshot.basemap) setBasemap(snapshot.basemap as BasemapType);

        // Refresh the local offline cache when the cloud copy is newer.
        if (snapshot === cloudSnapshot) {
          void saveGISWorkspaceSnapshot({
            projectId: workspaceProjectId,
            layers: snapshot.layers,
            rasters: snapshot.rasters ?? [],
            services: snapshot.services ?? [],
            selectedLayerId: snapshot.selectedLayerId,
            secondLayerId: snapshot.secondLayerId,
            tableLayerId: snapshot.tableLayerId,
            history: snapshot.history,
            modelNodes: snapshot.modelNodes,
            modelEdges: snapshot.modelEdges,
            activeTab: snapshot.activeTab,
            basemap: snapshot.basemap,
          });
        }
      } else {
        setLayers([]);
        setRasterLayers([]);
        setServiceLayers([]);
        setSelectedLayerId("");
        setSecondLayerId("");
        setTableLayerId(null);
        setHistory([]);
        setModelGraph(createDefaultGISModelGraph());
        setModelNodeStatus({});
        setModelLog([]);
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
      const rasterSnapshot: PersistedGISRasterLayer[] = rasterLayers.map((raster) => ({
        id: raster.id,
        name: raster.name,
        fileName: raster.file?.name ?? raster.fileName,
        mimeType: raster.file?.type || raster.mimeType || "image/tiff",
        sizeBytes: raster.file?.size ?? raster.sizeBytes ?? 0,
        visible: raster.visible,
        opacity: raster.opacity,
        isResult: raster.isResult,
        bandCount: raster.bandCount ?? null,
        bounds: raster.bounds ?? null,
        error: raster.error ?? null,
        rasterState: raster.rasterState ? { ...raster.rasterState } : undefined,
        rasterSymbology: raster.rasterSymbology
          ? { ...raster.rasterSymbology }
          : undefined,
        remoteUrl: raster.remoteUrl,
        sourceType: raster.sourceType,
        stacSource: raster.stacSource,
      }));

      const snapshot = {
        projectId: workspaceProjectId,
        layers,
        rasters: rasterSnapshot,
        services: serviceLayers,
        selectedLayerId,
        secondLayerId,
        tableLayerId,
        history,
        modelNodes: modelGraph.nodes,
        modelEdges: modelGraph.edges,
        activeTab,
        basemap,
      };

      void (async () => {
        await saveGISWorkspaceSnapshot(snapshot);
        await syncGISWorkspaceRasterFiles(workspaceProjectId, rasterLayers).catch((error) => {
          console.warn("GIS Workspace: falha ao persistir rasters localmente:", error);
        });

        if (cloudUid && activeProject?.id) {
          await syncGISWorkspaceToCloud(cloudUid, snapshot).catch((error) => {
            console.warn("GIS Workspace: cloud sync deferred; local copy is safe:", error);
          });
        }
      })();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    workspaceHydrated,
    workspaceProjectId,
    cloudUid,
    activeProject?.id,
    layers,
    rasterLayers,
    serviceLayers,
    selectedLayerId,
    secondLayerId,
    tableLayerId,
    history,
    modelGraph,
    activeTab,
    basemap,
  ]);


  // Spatial SQL Workspace
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);

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

  const selectedWhiteboxVectorSupport = useMemo(
    () => (selectedWhiteboxTool ? whiteboxVectorSupport(selectedWhiteboxTool) : null),
    [selectedWhiteboxTool]
  );

  const selectedWhiteboxRasterSupport = useMemo(
    () => (selectedWhiteboxTool ? whiteboxRasterSupport(selectedWhiteboxTool) : null),
    [selectedWhiteboxTool]
  );

  const selectedWhiteboxMode = useMemo<"vector" | "raster" | null>(() => {
    if (selectedWhiteboxVectorSupport?.supported) return "vector";
    if (selectedWhiteboxRasterSupport?.supported) return "raster";
    return null;
  }, [selectedWhiteboxVectorSupport, selectedWhiteboxRasterSupport]);

  const selectedBackendRasterTool = useMemo<GISHeavyToolId | null>(() => {
    const id = selectedWhiteboxTool?.id.toLowerCase();
    return id === "hillshade" || id === "slope" || id === "aspect"
      ? id
      : null;
  }, [selectedWhiteboxTool]);

  const loadRasterBandStats = useCallback(
    async (layer: GISWorkspaceRasterLayer, band: number, signal?: AbortSignal) => {
      const key = rasterStatsKey(layer.id, band);
      setRasterStatsLoadingKey(key);
      setRasterStatsErrors((previous) => {
        if (!previous[key]) return previous;
        const next = { ...previous };
        delete next[key];
        return next;
      });
      try {
        const stats = await getGISRasterBandStats(layer, band, signal);
        if (!stats) throw new Error("Não foi possível calcular estatísticas desta banda.");
        setRasterBandStats((previous) => ({ ...previous, [key]: stats }));
      } catch (error) {
        if (signal?.aborted) return;
        setRasterStatsErrors((previous) => ({
          ...previous,
          [key]: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        setRasterStatsLoadingKey((current) => (current === key ? null : current));
      }
    },
    []
  );

  const selectedWhiteboxRaster = useMemo(
    () => rasterLayers.find((layer) => layer.id === selectedWhiteboxRasterId) ?? null,
    [rasterLayers, selectedWhiteboxRasterId]
  );

  const secondaryWhiteboxRaster = useMemo(
    () => rasterLayers.find((layer) => layer.id === secondWhiteboxRasterId) ?? null,
    [rasterLayers, secondWhiteboxRasterId]
  );

  React.useEffect(() => {
    if (!selectedWhiteboxRaster) return;
    const mode = selectedWhiteboxRaster.rasterState?.mode ?? "single";
    const configuredBands = selectedWhiteboxRaster.rasterState?.bands?.length
      ? selectedWhiteboxRaster.rasterState.bands
      : [1];
    const bands =
      mode === "rgb" ? configuredBands.slice(0, 3) : [configuredBands[0] ?? 1];
    const band = bands.find((candidate) => {
      const key = rasterStatsKey(selectedWhiteboxRaster.id, candidate);
      return !rasterBandStats[key] && rasterStatsLoadingKey !== key;
    });
    if (!band) return;

    const controller = new AbortController();
    void loadRasterBandStats(selectedWhiteboxRaster, band, controller.signal);
    return () => controller.abort();
  }, [
    loadRasterBandStats,
    rasterBandStats,
    rasterStatsLoadingKey,
    selectedWhiteboxRaster,
  ]);

  React.useEffect(() => {
    if (selectedWhiteboxMode !== "raster") return;
    if (!selectedWhiteboxRaster && rasterLayers[0]) {
      setSelectedWhiteboxRasterId(rasterLayers[0].id);
    }
    if (
      secondWhiteboxRasterId &&
      !rasterLayers.some((layer) => layer.id === secondWhiteboxRasterId)
    ) {
      setSecondWhiteboxRasterId("");
    }
  }, [
    rasterLayers,
    secondWhiteboxRasterId,
    selectedWhiteboxMode,
    selectedWhiteboxRaster,
  ]);

  const openTerrainWhiteboxTool = useCallback(
    async (toolId: "hillshade" | "slope" | "aspect", rasterId: string) => {
      try {
        let tools = whiteboxTools;
        if (tools.length === 0) {
          setWhiteboxLoading(true);
          tools = await listWhiteboxWasmManifests();
          setWhiteboxTools(tools);
        }

        const tool = tools.find((candidate) => candidate.id === toolId);
        if (!tool || !whiteboxRasterSupport(tool).supported) {
          throw new Error(
            `A ferramenta ${toolId} não está disponível no runtime Whitebox atual.`
          );
        }

        setSelectedWhiteboxRasterId(rasterId);
        setSelectedWhiteboxToolId(tool.id);
        setWhiteboxParams(whiteboxManifestDefaults(tool));
        setToolSearch("");
        setToolCategoryFilter("all");
        setActiveTab("whitebox_toolbox");
        setSidebarOpen(true);

        toast({
          title: `${whiteboxManifestName(tool)} preparado`,
          description:
            "O DEM já está selecionado. Confirme os parâmetros e execute no Whitebox WASM.",
        });
      } catch (error) {
        toast({
          title: "Ferramenta de terreno indisponível",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      } finally {
        setWhiteboxLoading(false);
      }
    },
    [toast, whiteboxTools]
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

  const modelCatalog = useMemo(
    () => buildGISModelToolCatalog(GEOPROCESSING_TOOLS_CATALOG, whiteboxTools),
    [whiteboxTools]
  );

  React.useEffect(() => {
    if (
      !["whitebox_toolbox", "model_builder"].includes(activeTab) ||
      whiteboxTools.length > 0
    ) {
      return;
    }

    let cancelled = false;
    setWhiteboxLoading(true);
    setWhiteboxError(null);

    void listWhiteboxWasmManifests()
      .then((tools) => {
        if (cancelled) return;
        setWhiteboxTools(tools);
        const first =
          tools.find(
            (tool) =>
              whiteboxVectorSupport(tool).supported ||
              whiteboxRasterSupport(tool).supported
          ) ?? tools[0];
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
  }, [activeTab, whiteboxTools.length]);

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

  const handleRetrieveWfs = useCallback(async () => {
    const endpoint = wfsEndpoint.trim();
    if (!endpoint) {
      toast({
        title: "Introduza o endpoint WFS",
        description: "Use o URL base do serviço WFS ou um URL GetCapabilities.",
        variant: "destructive",
      });
      return;
    }

    try {
      const parsed = new URL(endpoint);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Use um endpoint HTTP ou HTTPS.");
      }
    } catch (error) {
      toast({
        title: "Endpoint WFS inválido",
        description: error instanceof Error ? error.message : "URL inválido.",
        variant: "destructive",
      });
      return;
    }

    setWfsLoading(true);
    try {
      const capabilities = await fetchWfsCapabilities(endpoint, {
        version: wfsVersion,
      });
      setWfsVersion(capabilities.version);
      setWfsFeatureTypes(capabilities.featureTypes);
      setSelectedWfsType((current) =>
        capabilities.featureTypes.some((item) => item.name === current)
          ? current
          : capabilities.featureTypes[0]?.name ?? ""
      );
      toast({
        title: "WFS ligado",
        description: `${capabilities.featureTypes.length} FeatureType(s) encontrados · WFS ${capabilities.version}.`,
      });
    } catch (error) {
      setWfsFeatureTypes([]);
      setSelectedWfsType("");
      toast({
        title: "Falha ao consultar WFS",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setWfsLoading(false);
    }
  }, [toast, wfsEndpoint, wfsVersion]);

  const handleImportWfs = useCallback(async () => {
    const featureType = wfsFeatureTypes.find(
      (item) => item.name === selectedWfsType
    );
    if (!featureType) {
      toast({
        title: "Selecione um FeatureType",
        description: "Consulte o GetCapabilities e escolha a camada a importar.",
        variant: "destructive",
      });
      return;
    }

    setWfsLoading(true);
    try {
      const parsed = await importWfsFeatureType({
        endpoint: wfsEndpoint,
        version: wfsVersion,
        typeName: featureType.name,
        title: featureType.title,
        wgs84Bounds: featureType.wgs84Bounds,
        maxFeatures: 5000,
      });

      const newLayer: UserLayer = {
        id: `wfs_${crypto.randomUUID().slice(0, 12)}`,
        name: parsed.name,
        geojson: parsed.geojson,
        featureCount: parsed.featureCount,
        geometryType: parsed.geometryType,
        fields: parsed.fields,
        color: PALETTE[layers.length % PALETTE.length],
        visible: true,
      };

      setLayers((previous) => [newLayer, ...previous]);
      setSelectedLayerId(newLayer.id);
      toast({
        title: "WFS importado",
        description: `${parsed.name}: ${parsed.featureCount} feições adicionadas ao Workspace.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao importar WFS",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setWfsLoading(false);
    }
  }, [
    layers.length,
    selectedWfsType,
    toast,
    wfsEndpoint,
    wfsFeatureTypes,
    wfsVersion,
  ]);

  const currentAoiBbox = useCallback((): [number, number, number, number] | undefined => {
    if (!stacUseAoi || aoi.source === "global" || !aoi.geometry) return undefined;
    try {
      const bounds = turfBbox({
        type: "Feature",
        properties: {},
        geometry: aoi.geometry as GeoJSON.Geometry,
      });
      if (bounds.length < 4 || bounds.some((value) => !Number.isFinite(value))) {
        return undefined;
      }
      return [bounds[0], bounds[1], bounds[2], bounds[3]];
    } catch {
      return undefined;
    }
  }, [aoi, stacUseAoi]);

  const handleConnectOgcApi = useCallback(async () => {
    const endpoint = ogcApiEndpoint.trim();
    if (!endpoint) {
      toast({
        title: "Introduza um OGC API - Features",
        description: "Pode colar a landing page, /collections, uma coleção ou até /items.",
        variant: "destructive",
      });
      return;
    }

    setOgcApiLoading(true);
    try {
      const connection = await connectOgcApiFeatures(endpoint);
      setOgcApiConnection(connection);
      setOgcApiCollection(
        connection.focusCollection || connection.collections[0]?.id || ""
      );
      toast({
        title: "OGC API ligado",
        description: `${connection.title}: ${connection.collections.length} coleção(ões) disponíveis.`,
      });
    } catch (error) {
      setOgcApiConnection(null);
      toast({
        title: "Falha no OGC API - Features",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setOgcApiLoading(false);
    }
  }, [ogcApiEndpoint, toast]);

  const handleImportOgcApi = useCallback(async () => {
    if (!ogcApiConnection || !ogcApiCollection) {
      toast({
        title: "Selecione uma coleção",
        description: "Ligue o OGC API e escolha a coleção a importar.",
        variant: "destructive",
      });
      return;
    }
    const collection = ogcApiConnection.collections.find(
      (candidate) => candidate.id === ogcApiCollection
    );
    if (!collection) return;

    let bbox: [number, number, number, number] | undefined;
    if (ogcApiUseAoi && aoi.source !== "global" && aoi.geometry) {
      try {
        const bounds = turfBbox({
          type: "Feature",
          properties: {},
          geometry: aoi.geometry as GeoJSON.Geometry,
        });
        if (bounds.length >= 4 && bounds.every(Number.isFinite)) {
          bbox = [bounds[0], bounds[1], bounds[2], bounds[3]];
        }
      } catch {
        bbox = undefined;
      }
    }

    setOgcApiLoading(true);
    try {
      const result = await importOgcApiFeatures(collection, {
        bbox,
        limit: 1000,
        maxFeatures: 5000,
      });
      const layer: UserLayer = {
        id: `ogcapi_${crypto.randomUUID().slice(0, 12)}`,
        name: collection.title,
        geojson: result.geojson,
        featureCount: result.geojson.features.length,
        geometryType: result.geometryType,
        fields: result.fields,
        color: PALETTE[layers.length % PALETTE.length],
        visible: true,
      };
      setLayers((previous) => [layer, ...previous]);
      setSelectedLayerId(layer.id);
      toast({
        title: "OGC API importado",
        description: `${layer.name}: ${layer.featureCount} feições adicionadas ao workspace.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao importar OGC API",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setOgcApiLoading(false);
    }
  }, [
    aoi,
    layers.length,
    ogcApiCollection,
    ogcApiConnection,
    ogcApiUseAoi,
    toast,
  ]);

  const handleRetrieveWmts = useCallback(async () => {
    const endpoint = wmtsEndpoint.trim();
    if (!endpoint) {
      toast({
        title: "Introduza o endpoint WMTS",
        description: "Use o URL base do serviço ou um GetCapabilities.",
        variant: "destructive",
      });
      return;
    }
    setWmtsLoading(true);
    try {
      const capabilities = await fetchWmtsCapabilities(endpoint);
      setWmtsCapabilities(capabilities);
      const firstLayer = capabilities.layers[0];
      setWmtsSelectedLayer(firstLayer?.identifier ?? "");
      setWmtsStyle(
        firstLayer?.styles.find((style) => style.isDefault)?.identifier ??
          firstLayer?.styles[0]?.identifier ??
          ""
      );
      const compatible = firstLayer
        ? compatibleWmtsMatrixSets(capabilities, firstLayer)
        : [];
      setWmtsSelectedMatrixSet(compatible[0]?.identifier ?? "");
      toast({
        title: "WMTS descoberto",
        description: `${capabilities.title}: ${capabilities.layers.length} layer(s) disponíveis.`,
      });
    } catch (error) {
      setWmtsCapabilities(null);
      toast({
        title: "Falha no WMTS GetCapabilities",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setWmtsLoading(false);
    }
  }, [toast, wmtsEndpoint]);

  const handleAddWmts = useCallback(() => {
    if (!wmtsCapabilities || !wmtsSelectedLayer || !wmtsSelectedMatrixSet) {
      toast({
        title: "WMTS incompleto",
        description: "Selecione a layer e o TileMatrixSet antes de adicionar.",
        variant: "destructive",
      });
      return;
    }

    try {
      const layer = wmtsCapabilities.layers.find(
        (candidate) => candidate.identifier === wmtsSelectedLayer
      );
      if (!layer) throw new Error("A layer WMTS selecionada já não existe no catálogo.");
      const matrixSet = wmtsCapabilities.matrixSets.find(
        (candidate) => candidate.identifier === wmtsSelectedMatrixSet
      );
      if (!matrixSet) throw new Error("O TileMatrixSet selecionado já não existe.");
      const tileUrl = createWmtsTileUrl({
        capabilities: wmtsCapabilities,
        layer,
        matrixSet,
        style: wmtsStyle,
      });
      const service = createServiceLayer({
        name: layer.title || layer.identifier,
        type: "wmts",
        endpoint: wmtsCapabilities.endpoint,
        tileUrl,
        tileSize: 256,
        metadata: {
          wmtsLayer: layer.identifier,
          tileMatrixSet: matrixSet.identifier,
          sourceLabel: wmtsCapabilities.title,
        },
      });
      setServiceLayers((previous) => [service, ...previous]);
      toast({
        title: "WMTS adicionado",
        description: `${service.name} · ${matrixSet.identifier} foi registado no projeto.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao adicionar WMTS",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }, [
    toast,
    wmtsCapabilities,
    wmtsSelectedLayer,
    wmtsSelectedMatrixSet,
    wmtsStyle,
  ]);

  const handleConnectStac = useCallback(async () => {
    const endpoint = stacEndpoint.trim();
    if (!endpoint) {
      toast({
        title: "Introduza um STAC API",
        description: "Use Planetary Computer, Earth Search ou um endpoint STAC compatível.",
        variant: "destructive",
      });
      return;
    }
    setStacLoading(true);
    try {
      const connection = await connectStacApi(endpoint);
      setStacConnection(connection);
      setStacCollection(connection.collections[0]?.id ?? "");
      setStacItems([]);
      setStacAssetChoice({});
      toast({
        title: "STAC ligado",
        description: `${connection.title} · ${connection.collections.length} coleção(ões) descobertas.`,
      });
    } catch (error) {
      setStacConnection(null);
      toast({
        title: "Falha ao ligar STAC",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setStacLoading(false);
    }
  }, [stacEndpoint, toast]);

  const handleSearchStac = useCallback(async () => {
    if (!stacConnection) {
      toast({
        title: "Ligue primeiro o catálogo STAC",
        description: "Carregue as coleções antes de pesquisar cenas.",
        variant: "destructive",
      });
      return;
    }

    const datetime =
      stacStartDate || stacEndDate
        ? `${stacStartDate ? `${stacStartDate}T00:00:00Z` : ".."}/${
            stacEndDate ? `${stacEndDate}T23:59:59Z` : ".."
          }`
        : undefined;

    setStacLoading(true);
    try {
      const items = await searchStacItems(stacConnection, {
        collection: stacCollection || undefined,
        bbox: currentAoiBbox(),
        datetime,
        limit: 24,
      });
      const rasterItems = items.filter((item) => stacRasterAssets(item).length > 0);
      setStacItems(rasterItems);
      setStacAssetChoice(
        Object.fromEntries(
          rasterItems.flatMap((item) => {
            const asset = stacRasterAssets(item)[0];
            return asset ? [[item.id, asset.key]] : [];
          })
        )
      );
      toast({
        title: "Pesquisa STAC concluída",
        description: `${rasterItems.length} item(ns) com GeoTIFF/COG prontos para adicionar.`,
      });
    } catch (error) {
      toast({
        title: "Falha na pesquisa STAC",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setStacLoading(false);
    }
  }, [
    currentAoiBbox,
    stacCollection,
    stacConnection,
    stacEndDate,
    stacStartDate,
    toast,
  ]);

  const handleAddStacAsset = useCallback(
    (item: GISStacItem, asset: GISStacAsset) => {
      if (!stacConnection) return;
      const collectionId = item.collection || stacCollection || undefined;
      const date = stacItemDate(item);
      const label = [
        collectionId,
        item.id,
        asset.title || asset.key,
        date ? date.slice(0, 10) : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const raster: GISWorkspaceRasterLayer = {
        id: `stac_raster_${crypto.randomUUID().slice(0, 12)}`,
        name: label,
        remoteUrl: asset.href,
        sourceType: "stac",
        stacSource: {
          catalogUrl: stacConnection.url,
          collectionId,
          itemId: item.id,
          assetKey: asset.key,
          href: asset.href,
        },
        fileName: `${item.id}_${asset.key}.tif`.replace(/[^a-zA-Z0-9._-]+/g, "_"),
        mimeType: asset.type || "image/tiff",
        sizeBytes: 0,
        visible: true,
        opacity: 1,
        bandCount: null,
        bounds:
          item.bbox && item.bbox.length >= 4
            ? [item.bbox[0], item.bbox[1], item.bbox[item.bbox.length - 2], item.bbox[item.bbox.length - 1]]
            : null,
        error: null,
        rasterState: {
          mode: "single",
          bands: [1],
          colormap: "viridis",
          reversed: false,
          rescale: null,
          nodata: "auto",
          stretch: "linear",
          gamma: 1,
        },
      };

      setRasterLayers((previous) => [raster, ...previous]);
      setSelectedWhiteboxRasterId(raster.id);
      toast({
        title: "Asset STAC adicionado",
        description:
          "O GeoMoz guardou a identidade original do asset; credenciais temporárias serão renovadas quando necessário.",
      });
    },
    [stacCollection, stacConnection, toast]
  );

  const handleImportRemoteGeoJson = useCallback(async () => {
    const raw = remoteGeoJsonUrl.trim();
    if (!raw) {
      toast({
        title: "Introduza um URL GeoJSON",
        description: "Cole um endpoint HTTP/HTTPS que devolva FeatureCollection ou Feature.",
        variant: "destructive",
      });
      return;
    }

    setRemoteVectorLoading(true);
    try {
      const parsed = await fetchRemoteGeoJson(raw);
      const layer: UserLayer = {
        id: `remote_geojson_${crypto.randomUUID().slice(0, 12)}`,
        name: parsed.name,
        geojson: parsed.geojson,
        featureCount: parsed.geojson.features.length,
        geometryType: parsed.geometryType,
        fields: parsed.fields,
        color: PALETTE[layers.length % PALETTE.length],
        visible: true,
      };
      setLayers((previous) => [layer, ...previous]);
      setSelectedLayerId(layer.id);
      setRemoteGeoJsonUrl("");
      toast({
        title: "GeoJSON remoto importado",
        description: `${layer.name}: ${layer.featureCount} feições disponíveis no mapa, SQL e processamento.`,
      });
    } catch (error) {
      toast({
        title: "Falha ao importar GeoJSON remoto",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setRemoteVectorLoading(false);
    }
  }, [layers.length, remoteGeoJsonUrl, toast]);

  const handleInspectPmtiles = useCallback(async () => {
    const raw = pmtilesUrl.trim();
    if (!raw) {
      toast({
        title: "Introduza um URL PMTiles",
        description: "Use um arquivo .pmtiles remoto servido com HTTP Range.",
        variant: "destructive",
      });
      return;
    }
    setPmtilesLoading(true);
    try {
      const info = await inspectRemotePMTiles(raw);
      setPmtilesInfo(info);
      setPmtilesSourceLayersText(info.sourceLayers.join(", "));
      if (!pmtilesName.trim()) {
        try {
          const url = new URL(raw);
          const file = decodeURIComponent(
            url.pathname.split("/").filter(Boolean).pop() || "PMTiles"
          );
          setPmtilesName(file.replace(/\.pmtiles$/i, "") || "PMTiles");
        } catch {
          setPmtilesName("PMTiles");
        }
      }
      toast({
        title: "PMTiles inspecionado",
        description:
          info.tileType === "vector"
            ? `Vector · ${info.sourceLayers.length} source layer(s) · z${info.minZoom}–${info.maxZoom}`
            : `Raster · z${info.minZoom}–${info.maxZoom}`,
      });
    } catch (error) {
      setPmtilesInfo(null);
      toast({
        title: "Falha ao abrir PMTiles",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setPmtilesLoading(false);
    }
  }, [pmtilesName, pmtilesUrl, toast]);

  const handleAddPmtiles = useCallback(() => {
    if (!pmtilesInfo || !pmtilesUrl.trim()) return;
    const sourceLayers =
      pmtilesInfo.tileType === "vector"
        ? pmtilesSourceLayersText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    if (pmtilesInfo.tileType === "vector" && !sourceLayers.length) {
      toast({
        title: "Source layer necessária",
        description:
          "Este PMTiles vetorial não anunciou vector_layers; indique pelo menos uma source layer.",
        variant: "destructive",
      });
      return;
    }

    const endpoint = pmtilesUrl.trim();
    const service = createServiceLayer({
      name: pmtilesName.trim() || "PMTiles",
      type:
        pmtilesInfo.tileType === "vector"
          ? "pmtiles-vector"
          : "pmtiles-raster",
      endpoint,
      tileUrl: `pmtiles://${endpoint}`,
      minZoom: pmtilesInfo.minZoom,
      maxZoom: pmtilesInfo.maxZoom,
      tileSize: 256,
      metadata: {
        sourceLabel: "PMTiles · HTTP Range",
        pmtilesSourceLayers: sourceLayers,
        pmtilesBounds: pmtilesInfo.bounds,
        pmtilesEncoding: pmtilesInfo.encoding,
      },
    });
    setServiceLayers((previous) => [service, ...previous]);
    setPmtilesUrl("");
    setPmtilesName("");
    setPmtilesInfo(null);
    setPmtilesSourceLayersText("");
    toast({
      title: "PMTiles adicionado",
      description:
        pmtilesInfo.tileType === "vector"
          ? `${sourceLayers.length} source layer(s) serão renderizadas diretamente do arquivo.`
          : "O arquivo raster será servido diretamente via HTTP Range.",
    });
  }, [
    pmtilesInfo,
    pmtilesName,
    pmtilesSourceLayersText,
    pmtilesUrl,
    toast,
  ]);

  const handleAddTileService = useCallback(() => {
    try {
      const tileUrl = validateXyzTemplate(tileServiceUrl.trim());
      const service = createServiceLayer({
        name:
          tileServiceName.trim() ||
          (tileServiceType === "wmts" ? "WMTS remoto" : "XYZ remoto"),
        type: tileServiceType,
        endpoint: tileUrl,
        tileUrl,
        attribution: tileServiceAttribution.trim() || undefined,
        tileSize: 256,
        metadata: {
          sourceLabel: tileServiceType === "wmts" ? "WMTS template" : "XYZ template",
        },
      });
      setServiceLayers((previous) => [service, ...previous]);
      setTileServiceName("");
      setTileServiceUrl("");
      setTileServiceAttribution("");
      toast({
        title: `${tileServiceType.toUpperCase()} adicionado`,
        description: "A fonte foi guardada no projeto e será restaurada automaticamente.",
      });
    } catch (error) {
      toast({
        title: "Template de tiles inválido",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }, [
    tileServiceAttribution,
    tileServiceName,
    tileServiceType,
    tileServiceUrl,
    toast,
  ]);

  const handleRetrieveWms = useCallback(async () => {
    const endpoint = wmsEndpoint.trim();
    if (!endpoint) {
      toast({
        title: "Introduza o endpoint WMS",
        description: "Use o URL base do serviço WMS ou um GetCapabilities.",
        variant: "destructive",
      });
      return;
    }
    setWmsLoading(true);
    try {
      const capabilities = await fetchWmsCapabilities(endpoint);
      setWmsCapabilities(capabilities);
      const first = capabilities.layers[0];
      setWmsSelectedLayer(first?.name ?? "");
      setWmsStyle(first?.styles[0]?.name ?? "");
      toast({
        title: "WMS descoberto",
        description: `${capabilities.title}: ${capabilities.layers.length} camada(s) disponíveis.`,
      });
    } catch (error) {
      toast({
        title: "Falha no WMS GetCapabilities",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setWmsLoading(false);
    }
  }, [toast, wmsEndpoint]);

  const handleAddWms = useCallback(() => {
    if (!wmsCapabilities || !wmsSelectedLayer) {
      toast({
        title: "Selecione uma camada WMS",
        description: "Consulte primeiro o GetCapabilities e escolha uma camada.",
        variant: "destructive",
      });
      return;
    }
    const selected = wmsCapabilities.layers.find(
      (layer) => layer.name === wmsSelectedLayer
    );
    const tileUrl = createWmsTileUrl({
      endpoint: wmsCapabilities.endpoint,
      layer: wmsSelectedLayer,
      style: wmsStyle,
      version: wmsCapabilities.version,
      format: "image/png",
      transparent: true,
      tileSize: 256,
    });
    const service = createServiceLayer({
      name: selected?.title || wmsSelectedLayer,
      type: "wms",
      endpoint: wmsCapabilities.endpoint,
      tileUrl,
      tileSize: 256,
      metadata: {
        wmsLayer: wmsSelectedLayer,
        wmsVersion: wmsCapabilities.version,
        wmsFormat: "image/png",
        sourceLabel: wmsCapabilities.title,
      },
    });
    setServiceLayers((previous) => [service, ...previous]);
    toast({
      title: "WMS adicionado",
      description: `${service.name} foi registado como camada persistente do projeto.`,
    });
  }, [toast, wmsCapabilities, wmsSelectedLayer, wmsStyle]);

  const handleAddRasterUrl = useCallback(() => {
    const raw = rasterUrl.trim();
    if (!raw) {
      toast({
        title: "Introduza um URL",
        description: "Cole o endereço HTTP/HTTPS de um GeoTIFF ou COG remoto.",
        variant: "destructive",
      });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      toast({
        title: "URL inválido",
        description: "Use um endereço completo iniciado por http:// ou https://.",
        variant: "destructive",
      });
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      toast({
        title: "Protocolo não suportado",
        description: "O GIS Workspace aceita rasters remotos por HTTP ou HTTPS.",
        variant: "destructive",
      });
      return;
    }

    const lastSegment = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).pop() || "raster-remoto.tif"
    );
    const fileName = /\.tiff?$/i.test(lastSegment)
      ? lastSegment
      : `${lastSegment || "raster-remoto"}.tif`;
    const name = fileName.replace(/\.[^/.]+$/, "");

    const raster: GISWorkspaceRasterLayer = {
      id: `raster_url_${crypto.randomUUID().slice(0, 12)}`,
      name,
      remoteUrl: parsed.toString(),
      sourceType: "url",
      fileName,
      mimeType: "image/tiff",
      sizeBytes: 0,
      visible: true,
      opacity: 1,
      bandCount: null,
      bounds: null,
      error: null,
      rasterState: {
        mode: "single",
        bands: [1],
        colormap: "viridis",
        reversed: false,
        rescale: null,
        nodata: "auto",
        stretch: "linear",
        gamma: 1,
      },
    };

    setRasterLayers((previous) => [raster, ...previous]);
    setSelectedWhiteboxRasterId(raster.id);
    setRasterUrl("");
    setShowRasterUrlInput(false);
    toast({
      title: "COG remoto adicionado",
      description:
        "O raster será lido diretamente por HTTP Range quando o servidor suportar pedidos parciais.",
    });
  }, [rasterUrl, toast]);

  // ── Handle File Upload ───────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const shapefileSidecars = new Set(["dbf", "shx", "prj", "cpg"]);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (shapefileSidecars.has(extension)) continue;

        if (extension === "tif" || extension === "tiff") {
          const raster: GISWorkspaceRasterLayer = {
            id: `raster_${crypto.randomUUID().slice(0, 12)}`,
            name: file.name.replace(/\.[^/.]+$/, ""),
            file,
            sourceType: "storage",
            fileName: file.name,
            mimeType: file.type || "image/tiff",
            sizeBytes: file.size,
            visible: true,
            opacity: 1,
            bandCount: null,
            bounds: null,
            error: null,
            rasterState: {
              mode: "single",
              bands: [1],
              colormap: "viridis",
              reversed: false,
              rescale: null,
              nodata: "auto",
              stretch: "linear",
              gamma: 1,
            },
          };
          setRasterLayers((previous) => [raster, ...previous]);
          setSelectedWhiteboxRasterId(raster.id);
          toast({
            title: "Raster adicionado",
            description: `${raster.name} será lido como GeoTIFF/COG no mapa do GIS Workspace.`,
          });
          continue;
        }

        const duckDbFormats = new Set([
          "gpkg",
          "geoparquet",
          "parquet",
          "pq",
          "fgb",
          "gml",
          "kml",
          "dxf",
          "zip",
        ]);
        const parsed =
          extension === "shp"
            ? await importShapefileBundleWithDuckDb(
                selectedFiles.filter(
                  (candidate) =>
                    candidate.name.replace(/\.[^/.]+$/, "").toLowerCase() ===
                    file.name.replace(/\.[^/.]+$/, "").toLowerCase()
                )
              )
            : duckDbFormats.has(extension)
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
            extension === "shp" || duckDbFormats.has(extension)
              ? "DuckDB Spatial"
              : "parser local"
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

  const updateRasterState = useCallback(
    (
      rasterId: string,
      patch: NonNullable<GISWorkspaceRasterLayer["rasterState"]>
    ) => {
      setRasterLayers((previous) =>
        previous.map((layer) =>
          layer.id === rasterId
            ? {
                ...layer,
                rasterState: {
                  ...layer.rasterState,
                  ...patch,
                },
              }
            : layer
        )
      );
    },
    []
  );

  const updateRasterSymbology = useCallback(
    (rasterId: string, symbology: GISRasterSymbology | undefined) => {
      setRasterLayers((previous) =>
        previous.map((layer) =>
          layer.id === rasterId ? { ...layer, rasterSymbology: symbology } : layer
        )
      );
    },
    []
  );

  const handleRasterMetadata = useCallback(
    (metadata: GISWorkspaceRasterMetadata) => {
      setRasterLayers((previous) => {
        let changed = false;
        const next = previous.map((layer) => {
          if (layer.id !== metadata.id) return layer;
          const sameBounds =
            JSON.stringify(layer.bounds ?? null) === JSON.stringify(metadata.bounds ?? null);
          const sameRasterState =
            JSON.stringify(layer.rasterState ?? {}) ===
            JSON.stringify(metadata.rasterState ?? {});
          if (
            layer.bandCount === metadata.bandCount &&
            sameBounds &&
            sameRasterState &&
            (layer.error ?? null) === (metadata.error ?? null)
          ) {
            return layer;
          }
          changed = true;
          return {
            ...layer,
            bandCount: metadata.bandCount,
            bounds: metadata.bounds,
            error: metadata.error,
            rasterState: metadata.rasterState,
          };
        });
        return changed ? next : previous;
      });
    },
    []
  );

  const handleRasterError = useCallback(
    (layerId: string, message: string) => {
      setRasterLayers((previous) =>
        previous.map((layer) => (layer.id === layerId ? { ...layer, error: message } : layer))
      );
      const key = `${layerId}:${message}`;
      if (rasterErrorToastRef.current.has(key)) return;
      rasterErrorToastRef.current.add(key);
      toast({
        title: "Falha ao abrir raster",
        description: message,
        variant: "destructive",
      });
    },
    [toast]
  );

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

  const readRasterBytes = useCallback(
    async (layer: GISWorkspaceRasterLayer): Promise<Uint8Array> => {
      if (layer.file) {
        return new Uint8Array(await layer.file.arrayBuffer());
      }
      const remoteUrl = await resolveGISRasterRemoteUrl(layer);
      if (remoteUrl) {
        const response = await fetch(remoteUrl);
        if (!response.ok) {
          throw new Error(
            `Não foi possível transferir "${layer.name}" da fonte remota (HTTP ${response.status}).`
          );
        }
        return new Uint8Array(await response.arrayBuffer());
      }
      throw new Error(`A camada raster "${layer.name}" não possui bytes acessíveis.`);
    },
    []
  );

  const handleRunModel = useCallback(async () => {
    const controller = new AbortController();
    modelAbortRef.current = controller;
    const availableLayerIds = new Set([
      ...layers.map((layer) => layer.id),
      ...rasterLayers.map((layer) => layer.id),
    ]);
    const issues = validateGISModelGraph(
      modelGraph,
      modelCatalog,
      availableLayerIds
    );
    if (issues.length > 0) {
      toast({
        title: "Modelo ainda não executável",
        description: issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    setModelNodeStatus({});
    setModelLog([]);
    const started = performance.now();
    const emittedNames: string[] = [];
    let emittedVectorFeatures = 0;
    let emittedRasters = 0;

    try {
      const result = await runGISModelGraph(modelGraph, {
        catalog: modelCatalog,
        signal: controller.signal,
        resolveInput: async (node): Promise<GISModelValue | null> => {
          if (!node.layerId) return null;
          if (node.dataKind === "raster") {
            const raster = rasterLayers.find((layer) => layer.id === node.layerId);
            if (!raster) return null;
            return {
              kind: "raster",
              bytes: await readRasterBytes(raster),
              name: raster.name,
              fileName: raster.file?.name ?? raster.fileName,
            };
          }

          const vector = layers.find((layer) => layer.id === node.layerId);
          if (!vector) return null;
          return {
            kind: "vector",
            geojson: vector.geojson,
            name: vector.name,
          };
        },
        executeTool: async ({ node, descriptor, inputs, signal }) => {
          if (descriptor.provider === "turf") {
            const primary = inputs.input;
            if (!primary || primary.kind !== "vector") {
              throw new Error(`${descriptor.name} requer uma entrada vetorial.`);
            }
            const overlay = inputs.overlay;
            if (overlay && overlay.kind !== "vector") {
              throw new Error(`${descriptor.name} recebeu uma sobreposição não vetorial.`);
            }
            const { result } = executeToolById(
              descriptor.toolId,
              primary.geojson,
              node.parameters,
              overlay?.kind === "vector" ? overlay.geojson : undefined
            );
            return {
              output: {
                kind: "vector" as const,
                geojson: result,
                name: descriptor.name,
              },
            };
          }

          if (descriptor.provider === "backend-gdal") {
            const input = inputs.input;
            if (!input || input.kind !== "raster") {
              throw new Error(descriptor.name + " requer uma entrada raster.");
            }

            const tool = descriptor.toolId as GISHeavyToolId;
            const inputBytes = new Uint8Array(input.bytes).buffer;
            const inputFile = new File(
              [inputBytes],
              input.fileName ||
                (input.name || "model-input").replace(/[^a-zA-Z0-9._-]+/g, "_") +
                  ".tif",
              { type: "image/tiff" }
            );

            const created = await createGISHeavyJob({
              tool,
              file: inputFile,
              parameters: node.parameters,
              signal,
            });

            try {
              const completed = await waitForGISHeavyJob({
                jobId: created.job.id,
                signal,
                onProgress: (job) => {
                  setModelLog((previous) => {
                    const line =
                      descriptor.name +
                      ": " +
                      job.progress +
                      "% · " +
                      (job.message || job.status);
                    if (previous[previous.length - 1] === line) return previous;
                    return [...previous, line];
                  });
                },
              });

              const resultFile = await downloadGISHeavyJobResult(
                completed.id,
                signal
              );
              return {
                output: {
                  kind: "raster" as const,
                  bytes: new Uint8Array(await resultFile.arrayBuffer()),
                  name: descriptor.name,
                  fileName: resultFile.name,
                },
              };
            } finally {
              void deleteGISHeavyJob(created.job.id).catch(() => undefined);
            }
          }

          const manifest = descriptor.native as WhiteboxWasmManifest | undefined;
          if (!manifest) {
            throw new Error(`O manifesto Whitebox de "${descriptor.name}" não está disponível.`);
          }

          const vectorSupport = whiteboxVectorSupport(manifest);
          if (vectorSupport.supported) {
            const vectorInputs = vectorSupport.vectorInputs.map(
              (parameter) => inputs[parameter.name]
            );
            const first = vectorInputs[0];
            const second = vectorInputs[1];
            if (!first || first.kind !== "vector") {
              throw new Error(`${descriptor.name} requer uma camada vetorial principal.`);
            }
            if (second && second.kind !== "vector") {
              throw new Error(`${descriptor.name} recebeu uma segunda entrada incompatível.`);
            }
            const result = await runWhiteboxVectorTool({
              manifest,
              primaryLayer: first.geojson,
              secondaryLayer: second?.kind === "vector" ? second.geojson : undefined,
              parameters: node.parameters,
            });
            return Object.fromEntries(
              result.outputs.map((output) => [
                output.parameter,
                {
                  kind: "vector" as const,
                  geojson: output.geojson,
                  name: `${descriptor.name} — ${output.parameter}`,
                },
              ])
            );
          }

          const rasterSupport = whiteboxRasterSupport(manifest);
          if (rasterSupport.supported) {
            const rasterInputs = rasterSupport.rasterInputs.map(
              (parameter) => inputs[parameter.name]
            );
            const first = rasterInputs[0];
            const second = rasterInputs[1];
            if (!first || first.kind !== "raster") {
              throw new Error(`${descriptor.name} requer um raster principal.`);
            }
            if (second && second.kind !== "raster") {
              throw new Error(`${descriptor.name} recebeu um segundo raster incompatível.`);
            }

            const result = await runWhiteboxRasterTool({
              manifest,
              primaryRaster: {
                name: first.name || "input.tif",
                bytes: first.bytes,
              },
              secondaryRaster:
                second?.kind === "raster"
                  ? {
                      name: second.name || "secondary.tif",
                      bytes: second.bytes,
                    }
                  : undefined,
              parameters: node.parameters,
            });
            return Object.fromEntries(
              result.outputs.map((output) => [
                output.parameter,
                {
                  kind: "raster" as const,
                  bytes: output.bytes,
                  name: `${descriptor.name} — ${output.parameter}`,
                  fileName: output.fileName,
                },
              ])
            );
          }

          throw new Error(
            `A ferramenta Whitebox "${descriptor.name}" não possui um adapter vetorial/raster compatível.`
          );
        },
        emitOutput: async (node, value) => {
          if (value.kind === "vector") {
            const geojson = value.geojson;
            const id = `model_vector_${crypto.randomUUID().slice(0, 12)}`;
            const layer: UserLayer = {
              id,
              name: node.name.trim() || value.name || "Resultado do modelo",
              geojson,
              featureCount: geojson.features.length,
              geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
              fields: geojson.features[0]?.properties
                ? Object.keys(geojson.features[0].properties)
                : [],
              color: PALETTE[(layers.length + emittedNames.length + 1) % PALETTE.length],
              visible: true,
              isResult: true,
            };
            emittedNames.push(layer.name);
            emittedVectorFeatures += layer.featureCount;
            setLayers((previous) => [layer, ...previous]);
            setSelectedLayerId(id);
            return;
          }

          const fileName =
            value.fileName ||
            `${(node.name || "model_raster").replace(/[^a-zA-Z0-9_-]+/g, "_")}.tif`;
          const bytes = new Uint8Array(value.bytes);
          const file = new File([bytes.buffer], fileName, { type: "image/tiff" });
          const raster: GISWorkspaceRasterLayer = {
            id: `model_raster_${crypto.randomUUID().slice(0, 12)}`,
            name: node.name.trim() || value.name || "Resultado raster do modelo",
            file,
            sourceType: "storage",
            fileName,
            mimeType: "image/tiff",
            sizeBytes: file.size,
            visible: true,
            opacity: 1,
            isResult: true,
            bandCount: null,
            bounds: null,
            error: null,
            rasterState: {
              mode: "single",
              bands: [1],
              colormap: "viridis",
              reversed: false,
              rescale: null,
              nodata: "auto",
              stretch: "linear",
              gamma: 1,
            },
          };
          emittedNames.push(raster.name);
          emittedRasters += 1;
          setRasterLayers((previous) => [raster, ...previous]);
          setSelectedWhiteboxRasterId(raster.id);
        },
        onNodeStatus: (nodeId, status) =>
          setModelNodeStatus((previous) => ({
            ...previous,
            [nodeId]: status,
          })),
        log: (line) => setModelLog((previous) => [...previous, line]),
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      const durationMs = Math.round(performance.now() - started);
      setHistory((previous) => [
        {
          id: `hist_model_${Date.now()}`,
          toolId: "hybrid_model_graph",
          toolName: "Model Builder híbrido",
          engine: "Hybrid Model",
          timestamp: new Date().toLocaleTimeString("pt-PT"),
          durationMs,
          inputLayerName: modelGraph.nodes
            .filter((node) => node.kind === "input")
            .map((node) => {
              const vector = layers.find((layer) => layer.id === node.layerId);
              const raster = rasterLayers.find((layer) => layer.id === node.layerId);
              return vector?.name || raster?.name || node.name;
            })
            .join(", "),
          outputCount:
            emittedVectorFeatures > 0 && emittedRasters > 0
              ? emittedNames.length
              : emittedRasters > 0
                ? emittedRasters
                : emittedVectorFeatures,
          outputLabel:
            emittedVectorFeatures > 0 && emittedRasters > 0
              ? "saídas (vetor + raster)"
              : emittedRasters > 0
                ? emittedRasters === 1
                  ? "raster"
                  : "rasters"
                : "feições",
          status: "success",
          parameters: {
            nodes: modelGraph.nodes.length,
            edges: modelGraph.edges.length,
            outputs: emittedNames,
          },
        },
        ...previous,
      ]);

      toast({
        title: "Modelo híbrido concluído",
        description: `${modelGraph.nodes.length} nós executados em ${durationMs}ms · ${emittedNames.length} saída(s) materializadas.`,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        toast({
          title: "Modelo cancelado",
          description: "A execução foi interrompida pelo utilizador.",
        });
      } else {
        toast({
          title: "Falha no Model Builder",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    } finally {
      if (modelAbortRef.current === controller) modelAbortRef.current = null;
      setIsExecuting(false);
    }
  }, [
    executeToolById,
    layers,
    modelCatalog,
    modelGraph,
    rasterLayers,
    readRasterBytes,
    toast,
  ]);

  const handleRunBackendRaster = useCallback(async () => {
    if (!selectedBackendRasterTool || !selectedWhiteboxRaster) {
      toast({
        title: "Backend GDAL indisponível",
        description: "Selecione Hillshade, Slope ou Aspect e uma camada raster.",
        variant: "destructive",
      });
      return;
    }

    heavyJobAbortRef.current?.abort();
    const controller = new AbortController();
    heavyJobAbortRef.current = controller;
    setIsExecuting(true);
    setHeavyJob(null);
    const started = performance.now();
    let jobId: string | null = null;

    try {
      let inputFile = selectedWhiteboxRaster.file;
      if (!inputFile) {
        const bytes = await readRasterBytes(selectedWhiteboxRaster);
        const name =
          selectedWhiteboxRaster.fileName ||
          selectedWhiteboxRaster.name.replace(/[^a-zA-Z0-9._-]+/g, "_") +
            ".tif";
        const uploadBuffer = new Uint8Array(bytes).buffer;
        inputFile = new File([uploadBuffer], name, { type: "image/tiff" });
      }

      const params: Record<string, unknown> = {};
      if (selectedBackendRasterTool === "hillshade") {
        params.azimuth = Number(
          whiteboxParams.azimuth ?? whiteboxParams.az ?? 315
        );
        params.altitude = Number(
          whiteboxParams.altitude ?? whiteboxParams.alt ?? 45
        );
        params.z_factor = Number(
          whiteboxParams.z_factor ?? whiteboxParams.zfactor ?? 1
        );
      } else if (selectedBackendRasterTool === "slope") {
        params.scale = Number(whiteboxParams.scale ?? 1);
        params.percent =
          String(whiteboxParams.units ?? "").toLowerCase() === "percent" ||
          Boolean(whiteboxParams.percent);
      } else if (selectedBackendRasterTool === "aspect") {
        params.zero_for_flat = true;
      }

      const created = await createGISHeavyJob({
        tool: selectedBackendRasterTool,
        file: inputFile,
        parameters: params,
        signal: controller.signal,
      });
      jobId = created.job.id;
      setHeavyJob(created.job);

      const completed = await waitForGISHeavyJob({
        jobId,
        signal: controller.signal,
        onProgress: setHeavyJob,
      });
      const resultFile = await downloadGISHeavyJobResult(
        completed.id,
        controller.signal
      );

      const preferredRasterColormap =
        selectedBackendRasterTool === "hillshade"
          ? "gray"
          : selectedBackendRasterTool === "slope"
            ? "terrain"
            : "turbo";
      const raster: GISWorkspaceRasterLayer = {
        id: "backend_raster_" + crypto.randomUUID().slice(0, 12),
        name:
          whiteboxManifestName(selectedWhiteboxTool!) +
          " — Backend GDAL",
        file: resultFile,
        sourceType: "storage",
        fileName: resultFile.name,
        mimeType: resultFile.type || "image/tiff",
        sizeBytes: resultFile.size,
        visible: true,
        opacity: 1,
        isResult: true,
        bandCount: null,
        bounds: null,
        error: null,
        rasterState: {
          mode: "single",
          bands: [1],
          colormap: preferredRasterColormap,
          reversed: false,
          rescale: null,
          nodata: "auto",
          stretch: "linear",
          gamma: 1,
        },
      };

      setRasterLayers((previous) => [raster, ...previous]);
      setSelectedWhiteboxRasterId(raster.id);
      const durationMs = Math.round(performance.now() - started);
      setHistory((previous) => [
        {
          id: "hist_backend_gdal_" + Date.now(),
          toolId: selectedBackendRasterTool,
          toolName:
            whiteboxManifestName(selectedWhiteboxTool!) + " · Backend GDAL",
          engine: "Backend GDAL",
          timestamp: new Date().toLocaleTimeString("pt-PT"),
          durationMs,
          inputLayerName: selectedWhiteboxRaster.name,
          outputCount: 1,
          outputLabel: "raster",
          status: "success",
          parameters: params,
        },
        ...previous,
      ]);

      toast({
        title: "Backend GDAL concluído",
        description:
          whiteboxManifestName(selectedWhiteboxTool!) +
          " processado no servidor em " +
          durationMs +
          " ms.",
      });

      void deleteGISHeavyJob(completed.id).catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted) {
        toast({
          title: "Job backend cancelado",
          description: "A execução foi interrompida no cliente.",
        });
      } else {
        toast({
          title: "Backend GDAL falhou",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
      if (jobId) {
        void deleteGISHeavyJob(jobId).catch(() => undefined);
      }
    } finally {
      if (heavyJobAbortRef.current === controller) {
        heavyJobAbortRef.current = null;
      }
      setIsExecuting(false);
    }
  }, [
    readRasterBytes,
    selectedBackendRasterTool,
    selectedWhiteboxRaster,
    selectedWhiteboxTool,
    toast,
    whiteboxParams,
  ]);

  const handleRunWhitebox = useCallback(async () => {
    if (!selectedWhiteboxTool || !selectedWhiteboxMode) {
      toast({
        title: "Ferramenta ainda não ligada ao tipo de camada",
        description:
          selectedWhiteboxRasterSupport?.reason ||
          selectedWhiteboxVectorSupport?.reason ||
          "Selecione uma ferramenta Whitebox compatível.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {
      if (selectedWhiteboxMode === "raster") {
        if (!selectedWhiteboxRaster) {
          throw new Error("Selecione uma camada raster de entrada.");
        }
        if (
          (selectedWhiteboxRasterSupport?.rasterInputs.length ?? 0) > 1 &&
          !secondaryWhiteboxRaster
        ) {
          throw new Error("Esta ferramenta Whitebox requer uma segunda camada raster.");
        }

        const primaryBytes = await readRasterBytes(selectedWhiteboxRaster);
        const secondaryBytes = secondaryWhiteboxRaster
          ? await readRasterBytes(secondaryWhiteboxRaster)
          : undefined;

        const result = await runWhiteboxRasterTool({
          manifest: selectedWhiteboxTool,
          primaryRaster: {
            name: selectedWhiteboxRaster.name,
            bytes: primaryBytes,
          },
          secondaryRaster:
            secondaryWhiteboxRaster && secondaryBytes
              ? {
                  name: secondaryWhiteboxRaster.name,
                  bytes: secondaryBytes,
                }
              : undefined,
          parameters: whiteboxParams,
        });

        const preferredRasterColormap =
          selectedWhiteboxTool.id === "hillshade"
            ? "gray"
            : selectedWhiteboxTool.id === "slope"
              ? "terrain"
              : selectedWhiteboxTool.id === "aspect"
                ? "turbo"
                : "viridis";

        const generated: GISWorkspaceRasterLayer[] = result.outputs.map((output) => {
          const buffer = new Uint8Array(output.bytes).buffer;
          const file = new File([buffer], output.fileName, { type: "image/tiff" });
          return {
            id: `whitebox_raster_${crypto.randomUUID().slice(0, 12)}`,
            name: `${whiteboxManifestName(selectedWhiteboxTool)} — ${output.parameter}`,
            file,
            sourceType: "storage",
            fileName: file.name,
            mimeType: "image/tiff",
            sizeBytes: file.size,
            visible: true,
            opacity: 1,
            isResult: true,
            bandCount: null,
            bounds: null,
            error: null,
            rasterState: {
              mode: "single",
              bands: [1],
              colormap: preferredRasterColormap,
              reversed: false,
              rescale: null,
              nodata: "auto",
              stretch: "linear",
              gamma: 1,
            },
          };
        });

        setRasterLayers((previous) => [...generated, ...previous]);
        setHistory((previous) => [
          {
            id: `hist_whitebox_raster_${Date.now()}`,
            toolId: selectedWhiteboxTool.id,
            toolName: whiteboxManifestName(selectedWhiteboxTool),
            engine: "WASM",
            timestamp: new Date().toLocaleTimeString("pt-PT"),
            durationMs: result.executionTimeMs,
            inputLayerName: [selectedWhiteboxRaster.name, secondaryWhiteboxRaster?.name]
              .filter(Boolean)
              .join(", "),
            outputCount: generated.length,
            outputLabel: generated.length === 1 ? "raster" : "rasters",
            status: "success",
            parameters: { ...whiteboxParams },
          },
          ...previous,
        ]);

        toast({
          title: "Whitebox Raster concluído",
          description: `${whiteboxManifestName(selectedWhiteboxTool)} gerou ${generated.length} COG raster em ${result.executionTimeMs}ms.`,
        });
        return;
      }

      if (!activeLayer) {
        throw new Error("Selecione uma camada vetorial de entrada.");
      }
      if (
        (selectedWhiteboxVectorSupport?.vectorInputs.length ?? 0) > 1 &&
        !secondaryLayer
      ) {
        throw new Error("Esta ferramenta Whitebox requer uma segunda camada vetorial.");
      }

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
          outputLabel: "feições",
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
    readRasterBytes,
    secondaryLayer,
    secondaryWhiteboxRaster,
    selectedWhiteboxMode,
    selectedWhiteboxRaster,
    selectedWhiteboxRasterSupport,
    selectedWhiteboxTool,
    selectedWhiteboxVectorSupport,
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

  // ── Export PDF Report ────────────────────────────────────────────────────
  const exportPdf = () => {
    const reportTitle = "Dossiê Avançado de Geoprocessamento";
    const ctx = createPDFContext(reportTitle);
    drawCover(
      ctx,
      `GeoMoz GIS Workspace — ${province ?? "Moçambique"} · Dados do Projeto`,
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
        accept=".geojson,.json,.csv,.kml,.gml,.gpkg,.parquet,.geoparquet,.pq,.fgb,.dxf,.shp,.dbf,.shx,.prj,.cpg,.zip,.tif,.tiff"
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
        } ${
          desktopSidebarOpen
            ? activeTab === "model_builder"
              ? "md:w-[min(72vw,980px)] overflow-y-auto"
              : "md:w-96 overflow-y-auto"
            : "md:w-0 overflow-hidden md:border-r-0"
        }`}
      >
        {/* Processing Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Wrench size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ferramentas GIS</h2>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  GeoMoz Core
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
              onClick={() => setActiveTab("vector_toolbox")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "vector_toolbox"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Wrench size={12} />
              <span>Vetores</span>
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
              onClick={() => setActiveTab("data_sources")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "data_sources"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Globe2 size={12} />
              <span>Dados</span>
            </button>
            <button
              onClick={() => setActiveTab("layers")}
              className={`p-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === "layers"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Layers size={12} />
              <span>Camadas ({layers.length + rasterLayers.length + serviceLayers.length})</span>
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
            
          </div>
        </div>

        {/* ── Data Sources: local, URL and OGC services ─────────────────── */}
        {activeTab === "data_sources" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-2.5 text-[11px] text-cyan-900 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-300">
              <span className="font-semibold block mb-0.5">Data Sources do projeto</span>
              Adicione ficheiros, dados cloud-native e serviços OGC. As fontes ficam
              persistidas com o GIS Workspace.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800"
              >
                <Upload size={16} className="mb-1.5 text-indigo-600" />
                <span className="block text-xs font-bold">Ficheiro local</span>
                <span className="text-[9px] text-slate-400">Vector · GeoTIFF/COG</span>
              </button>
              <button
                onClick={() => setShowRasterUrlInput((value) => !value)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-sky-300 dark:border-slate-700 dark:bg-slate-800"
              >
                <Mountain size={16} className="mb-1.5 text-sky-600" />
                <span className="block text-xs font-bold">COG remoto</span>
                <span className="text-[9px] text-slate-400">HTTP Range · GeoTIFF</span>
              </button>
            </div>

            {showRasterUrlInput && (
              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/50 p-2.5 dark:border-sky-900 dark:bg-sky-950/20">
                <label className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                  URL do COG / GeoTIFF
                </label>
                <input
                  value={rasterUrl}
                  onChange={(event) => setRasterUrl(event.target.value)}
                  placeholder="https://.../raster.tif"
                  className="w-full rounded-lg border border-sky-200 bg-white p-2 text-[10px] dark:border-sky-900 dark:bg-slate-900"
                />
                <button
                  onClick={handleAddRasterUrl}
                  className="w-full rounded-lg bg-sky-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-sky-700"
                >
                  Adicionar COG remoto
                </button>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <FileCode size={14} className="text-emerald-600" />
                <span className="text-xs font-bold">GeoJSON por URL</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={remoteGeoJsonUrl}
                  onChange={(event) => setRemoteGeoJsonUrl(event.target.value)}
                  placeholder="https://.../data.geojson"
                  className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white p-2 text-[10px] dark:border-emerald-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleImportRemoteGeoJson()}
                  disabled={remoteVectorLoading || !remoteGeoJsonUrl.trim()}
                  className="rounded-lg bg-emerald-600 px-3 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  {remoteVectorLoading ? "A ler…" : "Importar"}
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/40 p-2.5 dark:border-teal-900 dark:bg-teal-950/20">
              <div className="flex items-center gap-2">
                <Globe2 size={14} className="text-teal-600" />
                <span className="text-xs font-bold">WFS · Features</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={wfsEndpoint}
                  onChange={(event) => setWfsEndpoint(event.target.value)}
                  placeholder="https://.../wfs"
                  className="min-w-0 flex-1 rounded-lg border border-teal-200 bg-white p-2 text-[10px] dark:border-teal-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleRetrieveWfs()}
                  disabled={wfsLoading || !wfsEndpoint.trim()}
                  className="rounded-lg border border-teal-200 bg-white px-3 text-[10px] font-bold text-teal-700 disabled:opacity-50 dark:border-teal-900 dark:bg-slate-900 dark:text-teal-300"
                >
                  {wfsLoading ? "A consultar…" : "Listar"}
                </button>
              </div>
              {wfsFeatureTypes.length > 0 && (
                <div className="flex gap-1.5">
                  <select
                    value={selectedWfsType}
                    onChange={(event) => setSelectedWfsType(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-teal-200 bg-white p-2 text-[10px] dark:border-teal-900 dark:bg-slate-900"
                  >
                    {wfsFeatureTypes.map((featureType) => (
                      <option key={featureType.name} value={featureType.name}>
                        {featureType.title}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void handleImportWfs()}
                    disabled={wfsLoading || !selectedWfsType}
                    className="rounded-lg bg-teal-600 px-3 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    Importar
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-lime-200 bg-lime-50/40 p-2.5 dark:border-lime-900 dark:bg-lime-950/20">
              <div className="flex items-center gap-2">
                <Globe2 size={14} className="text-lime-700" />
                <span className="text-xs font-bold">OGC API - Features</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={ogcApiEndpoint}
                  onChange={(event) => {
                    setOgcApiEndpoint(event.target.value);
                    setOgcApiConnection(null);
                  }}
                  placeholder="https://.../api ou .../collections/roads/items"
                  className="min-w-0 flex-1 rounded-lg border border-lime-200 bg-white p-2 text-[10px] dark:border-lime-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleConnectOgcApi()}
                  disabled={ogcApiLoading || !ogcApiEndpoint.trim()}
                  className="rounded-lg border border-lime-200 bg-white px-3 text-[10px] font-bold text-lime-700 disabled:opacity-50 dark:border-lime-900 dark:bg-slate-900 dark:text-lime-300"
                >
                  {ogcApiLoading ? "A ligar…" : "Ligar"}
                </button>
              </div>

              {ogcApiConnection && (
                <>
                  <select
                    value={ogcApiCollection}
                    onChange={(event) => setOgcApiCollection(event.target.value)}
                    className="w-full rounded-lg border border-lime-200 bg-white p-2 text-[10px] dark:border-lime-900 dark:bg-slate-900"
                  >
                    {ogcApiConnection.collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.title} ({collection.id})
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-[9px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={ogcApiUseAoi}
                      disabled={aoi.source === "global"}
                      onChange={(event) => setOgcApiUseAoi(event.target.checked)}
                    />
                    Aplicar bbox da AOI atual
                  </label>
                  <button
                    onClick={() => void handleImportOgcApi()}
                    disabled={ogcApiLoading || !ogcApiCollection}
                    className="w-full rounded-lg bg-lime-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-lime-800 disabled:opacity-50"
                  >
                    {ogcApiLoading ? "A importar…" : "Importar features"}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-2.5 dark:border-blue-900 dark:bg-blue-950/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe2 size={14} className="text-blue-600" />
                  <span className="text-xs font-bold">STAC · Earth Observation</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStacEndpoint(PLANETARY_COMPUTER_STAC);
                      setStacConnection(null);
                    }}
                    className="rounded-md border border-blue-200 bg-white px-1.5 py-1 text-[9px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300"
                  >
                    Planetary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStacEndpoint(EARTH_SEARCH_STAC);
                      setStacConnection(null);
                    }}
                    className="rounded-md border border-blue-200 bg-white px-1.5 py-1 text-[9px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300"
                  >
                    Earth Search
                  </button>
                </div>
              </div>

              <div className="flex gap-1.5">
                <input
                  value={stacEndpoint}
                  onChange={(event) => {
                    setStacEndpoint(event.target.value);
                    setStacConnection(null);
                  }}
                  placeholder="https://.../stac/v1"
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white p-2 font-mono text-[9px] dark:border-blue-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleConnectStac()}
                  disabled={stacLoading || !stacEndpoint.trim()}
                  className="rounded-lg border border-blue-200 bg-white px-3 text-[10px] font-bold text-blue-700 disabled:opacity-50 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300"
                >
                  {stacLoading ? "A ligar…" : "Ligar"}
                </button>
              </div>

              {stacConnection && (
                <>
                  <div className="rounded-md bg-white/80 px-2 py-1.5 text-[9px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                    <strong>{stacConnection.title}</strong>
                    {stacConnection.description && (
                      <span className="ml-1 line-clamp-1">{stacConnection.description}</span>
                    )}
                  </div>

                  {stacConnection.collections.length > 0 ? (
                    <select
                      value={stacCollection}
                      onChange={(event) => setStacCollection(event.target.value)}
                      className="w-full rounded-lg border border-blue-200 bg-white p-2 text-[10px] dark:border-blue-900 dark:bg-slate-900"
                    >
                      <option value="">Todas as coleções</option>
                      {stacConnection.collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.title
                            ? `${collection.title} (${collection.id})`
                            : collection.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={stacCollection}
                      onChange={(event) => setStacCollection(event.target.value)}
                      placeholder="Collection ID (opcional)"
                      className="w-full rounded-lg border border-blue-200 bg-white p-2 text-[10px] dark:border-blue-900 dark:bg-slate-900"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="space-y-1">
                      <span className="text-[9px] font-semibold text-slate-500">De</span>
                      <input
                        type="date"
                        value={stacStartDate}
                        onChange={(event) => setStacStartDate(event.target.value)}
                        className="w-full rounded-lg border border-blue-200 bg-white p-1.5 text-[9px] dark:border-blue-900 dark:bg-slate-900"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[9px] font-semibold text-slate-500">Até</span>
                      <input
                        type="date"
                        value={stacEndDate}
                        onChange={(event) => setStacEndDate(event.target.value)}
                        className="w-full rounded-lg border border-blue-200 bg-white p-1.5 text-[9px] dark:border-blue-900 dark:bg-slate-900"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-[9px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={stacUseAoi}
                      disabled={aoi.source === "global"}
                      onChange={(event) => setStacUseAoi(event.target.checked)}
                    />
                    Limitar à AOI atual
                    {aoi.source === "global" && (
                      <span className="text-slate-400">(desenhe/seleccione uma AOI)</span>
                    )}
                  </label>

                  <button
                    onClick={() => void handleSearchStac()}
                    disabled={stacLoading}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {stacLoading ? "A pesquisar…" : "Pesquisar cenas STAC"}
                  </button>

                  {stacItems.length > 0 && (
                    <div className="max-h-72 space-y-1.5 overflow-auto pr-0.5">
                      {stacItems.map((item) => {
                        const assets = stacRasterAssets(item);
                        const assetKey =
                          stacAssetChoice[item.id] || assets[0]?.key || "";
                        const selectedAsset = assets.find(
                          (asset) => asset.key === assetKey
                        );
                        return (
                          <div
                            key={item.id}
                            className="rounded-lg border border-blue-100 bg-white p-2 dark:border-blue-900 dark:bg-slate-900"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">
                                {item.id}
                              </div>
                              <div className="text-[9px] text-slate-400">
                                {item.collection || stacCollection || "STAC"}
                                {stacItemDate(item)
                                  ? ` · ${stacItemDate(item).slice(0, 10)}`
                                  : ""}
                              </div>
                            </div>
                            <div className="mt-1.5 flex gap-1.5">
                              <select
                                value={assetKey}
                                onChange={(event) =>
                                  setStacAssetChoice((previous) => ({
                                    ...previous,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                className="min-w-0 flex-1 rounded-md border border-blue-100 bg-white p-1.5 text-[9px] dark:border-blue-900 dark:bg-slate-800"
                              >
                                {assets.map((asset) => (
                                  <option key={asset.key} value={asset.key}>
                                    {asset.title || asset.key}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!selectedAsset}
                                onClick={() => {
                                  if (selectedAsset) {
                                    handleAddStacAsset(item, selectedAsset);
                                  }
                                }}
                                className="rounded-md bg-blue-600 px-2.5 text-[9px] font-bold text-white disabled:opacity-50"
                              >
                                Adicionar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-2.5 dark:border-violet-900 dark:bg-violet-950/20">
              <div className="flex items-center gap-2">
                <Waves size={14} className="text-violet-600" />
                <span className="text-xs font-bold">WMS · GetCapabilities</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={wmsEndpoint}
                  onChange={(event) => setWmsEndpoint(event.target.value)}
                  placeholder="https://.../wms"
                  className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white p-2 text-[10px] dark:border-violet-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleRetrieveWms()}
                  disabled={wmsLoading || !wmsEndpoint.trim()}
                  className="rounded-lg border border-violet-200 bg-white px-3 text-[10px] font-bold text-violet-700 disabled:opacity-50 dark:border-violet-900 dark:bg-slate-900 dark:text-violet-300"
                >
                  {wmsLoading ? "A consultar…" : "Listar"}
                </button>
              </div>
              {wmsCapabilities && (
                <>
                  <select
                    value={wmsSelectedLayer}
                    onChange={(event) => {
                      const layerName = event.target.value;
                      setWmsSelectedLayer(layerName);
                      const layer = wmsCapabilities.layers.find(
                        (candidate) => candidate.name === layerName
                      );
                      setWmsStyle(layer?.styles[0]?.name ?? "");
                    }}
                    className="w-full rounded-lg border border-violet-200 bg-white p-2 text-[10px] dark:border-violet-900 dark:bg-slate-900"
                  >
                    {wmsCapabilities.layers.map((layer) => (
                      <option key={layer.name} value={layer.name}>
                        {layer.title} ({layer.name})
                      </option>
                    ))}
                  </select>
                  {(
                    wmsCapabilities.layers.find(
                      (layer) => layer.name === wmsSelectedLayer
                    )?.styles.length ?? 0
                  ) > 0 && (
                    <select
                      value={wmsStyle}
                      onChange={(event) => setWmsStyle(event.target.value)}
                      className="w-full rounded-lg border border-violet-200 bg-white p-2 text-[10px] dark:border-violet-900 dark:bg-slate-900"
                    >
                      <option value="">Estilo default</option>
                      {wmsCapabilities.layers
                        .find((layer) => layer.name === wmsSelectedLayer)
                        ?.styles.map((style) => (
                          <option key={style.name} value={style.name}>
                            {style.title}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    onClick={handleAddWms}
                    className="w-full rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-violet-700"
                  >
                    Adicionar WMS ao mapa
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-2.5 dark:border-fuchsia-900 dark:bg-fuchsia-950/20">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-fuchsia-600" />
                <span className="text-xs font-bold">WMTS · GetCapabilities</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={wmtsEndpoint}
                  onChange={(event) => {
                    setWmtsEndpoint(event.target.value);
                    setWmtsCapabilities(null);
                  }}
                  placeholder="https://.../wmts"
                  className="min-w-0 flex-1 rounded-lg border border-fuchsia-200 bg-white p-2 text-[10px] dark:border-fuchsia-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleRetrieveWmts()}
                  disabled={wmtsLoading || !wmtsEndpoint.trim()}
                  className="rounded-lg border border-fuchsia-200 bg-white px-3 text-[10px] font-bold text-fuchsia-700 disabled:opacity-50 dark:border-fuchsia-900 dark:bg-slate-900 dark:text-fuchsia-300"
                >
                  {wmtsLoading ? "A consultar…" : "Listar"}
                </button>
              </div>

              {wmtsCapabilities && (
                <>
                  <select
                    value={wmtsSelectedLayer}
                    onChange={(event) => {
                      const id = event.target.value;
                      setWmtsSelectedLayer(id);
                      const layer = wmtsCapabilities.layers.find(
                        (candidate) => candidate.identifier === id
                      );
                      setWmtsStyle(
                        layer?.styles.find((style) => style.isDefault)?.identifier ??
                          layer?.styles[0]?.identifier ??
                          ""
                      );
                      const compatible = layer
                        ? compatibleWmtsMatrixSets(wmtsCapabilities, layer)
                        : [];
                      setWmtsSelectedMatrixSet(compatible[0]?.identifier ?? "");
                    }}
                    className="w-full rounded-lg border border-fuchsia-200 bg-white p-2 text-[10px] dark:border-fuchsia-900 dark:bg-slate-900"
                  >
                    {wmtsCapabilities.layers.map((layer) => (
                      <option key={layer.identifier} value={layer.identifier}>
                        {layer.title} ({layer.identifier})
                      </option>
                    ))}
                  </select>

                  {(() => {
                    const layer = wmtsCapabilities.layers.find(
                      (candidate) => candidate.identifier === wmtsSelectedLayer
                    );
                    const sets = layer
                      ? compatibleWmtsMatrixSets(wmtsCapabilities, layer)
                      : [];
                    return (
                      <select
                        value={wmtsSelectedMatrixSet}
                        onChange={(event) =>
                          setWmtsSelectedMatrixSet(event.target.value)
                        }
                        className="w-full rounded-lg border border-fuchsia-200 bg-white p-2 text-[10px] dark:border-fuchsia-900 dark:bg-slate-900"
                      >
                        <option value="">TileMatrixSet…</option>
                        {sets.map((set) => (
                          <option key={set.identifier} value={set.identifier}>
                            {set.identifier} · {set.supportedCrs || "CRS não indicado"}
                          </option>
                        ))}
                      </select>
                    );
                  })()}

                  {(
                    wmtsCapabilities.layers.find(
                      (layer) => layer.identifier === wmtsSelectedLayer
                    )?.styles.length ?? 0
                  ) > 0 && (
                    <select
                      value={wmtsStyle}
                      onChange={(event) => setWmtsStyle(event.target.value)}
                      className="w-full rounded-lg border border-fuchsia-200 bg-white p-2 text-[10px] dark:border-fuchsia-900 dark:bg-slate-900"
                    >
                      {wmtsCapabilities.layers
                        .find((layer) => layer.identifier === wmtsSelectedLayer)
                        ?.styles.map((style) => (
                          <option key={style.identifier} value={style.identifier}>
                            {style.title}
                            {style.isDefault ? " · default" : ""}
                          </option>
                        ))}
                    </select>
                  )}

                  <button
                    onClick={handleAddWmts}
                    disabled={!wmtsSelectedMatrixSet}
                    className="w-full rounded-lg bg-fuchsia-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-fuchsia-700 disabled:opacity-50"
                  >
                    Adicionar WMTS descoberto
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/40 p-2.5 dark:border-orange-900 dark:bg-orange-950/20">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-orange-600" />
                <span className="text-xs font-bold">PMTiles · Cloud-native archive</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={pmtilesUrl}
                  onChange={(event) => {
                    setPmtilesUrl(event.target.value);
                    setPmtilesInfo(null);
                  }}
                  placeholder="https://.../dataset.pmtiles"
                  className="min-w-0 flex-1 rounded-lg border border-orange-200 bg-white p-2 font-mono text-[9px] dark:border-orange-900 dark:bg-slate-900"
                />
                <button
                  onClick={() => void handleInspectPmtiles()}
                  disabled={pmtilesLoading || !pmtilesUrl.trim()}
                  className="rounded-lg border border-orange-200 bg-white px-3 text-[10px] font-bold text-orange-700 disabled:opacity-50 dark:border-orange-900 dark:bg-slate-900 dark:text-orange-300"
                >
                  {pmtilesLoading ? "A ler…" : "Inspecionar"}
                </button>
              </div>

              {pmtilesInfo && (
                <>
                  <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                    <div className="rounded-md bg-white px-2 py-1.5 dark:bg-slate-900">
                      <span className="block text-slate-400">Tipo</span>
                      <strong>{pmtilesInfo.tileType}</strong>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5 dark:bg-slate-900">
                      <span className="block text-slate-400">Zoom</span>
                      <strong>
                        {pmtilesInfo.minZoom}–{pmtilesInfo.maxZoom}
                      </strong>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5 dark:bg-slate-900">
                      <span className="block text-slate-400">Layers</span>
                      <strong>
                        {pmtilesInfo.tileType === "vector"
                          ? pmtilesInfo.sourceLayers.length || "manual"
                          : "raster"}
                      </strong>
                    </div>
                  </div>

                  <input
                    value={pmtilesName}
                    onChange={(event) => setPmtilesName(event.target.value)}
                    placeholder="Nome da camada"
                    className="w-full rounded-lg border border-orange-200 bg-white p-2 text-[10px] dark:border-orange-900 dark:bg-slate-900"
                  />

                  {pmtilesInfo.tileType === "vector" && (
                    <label className="space-y-1">
                      <span className="text-[9px] font-semibold text-slate-500">
                        Source layers (separadas por vírgula)
                      </span>
                      <input
                        value={pmtilesSourceLayersText}
                        onChange={(event) =>
                          setPmtilesSourceLayersText(event.target.value)
                        }
                        placeholder="buildings, roads, water"
                        className="w-full rounded-lg border border-orange-200 bg-white p-2 text-[10px] dark:border-orange-900 dark:bg-slate-900"
                      />
                    </label>
                  )}

                  <button
                    onClick={handleAddPmtiles}
                    className="w-full rounded-lg bg-orange-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-orange-700"
                  >
                    Adicionar PMTiles ao projeto
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-2.5 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 size={14} className="text-amber-600" />
                  <span className="text-xs font-bold">Tiles XYZ / WMTS</span>
                </div>
                <select
                  value={tileServiceType}
                  onChange={(event) =>
                    setTileServiceType(event.target.value as "xyz" | "wmts")
                  }
                  className="rounded-md border border-amber-200 bg-white px-1.5 py-1 text-[9px] dark:border-amber-900 dark:bg-slate-900"
                >
                  <option value="xyz">XYZ</option>
                  <option value="wmts">WMTS REST</option>
                </select>
              </div>
              <input
                value={tileServiceName}
                onChange={(event) => setTileServiceName(event.target.value)}
                placeholder="Nome da camada"
                className="w-full rounded-lg border border-amber-200 bg-white p-2 text-[10px] dark:border-amber-900 dark:bg-slate-900"
              />
              <input
                value={tileServiceUrl}
                onChange={(event) => setTileServiceUrl(event.target.value)}
                placeholder="https://.../{z}/{x}/{y}.png"
                className="w-full rounded-lg border border-amber-200 bg-white p-2 font-mono text-[10px] dark:border-amber-900 dark:bg-slate-900"
              />
              <input
                value={tileServiceAttribution}
                onChange={(event) => setTileServiceAttribution(event.target.value)}
                placeholder="Atribuição / copyright (opcional)"
                className="w-full rounded-lg border border-amber-200 bg-white p-2 text-[10px] dark:border-amber-900 dark:bg-slate-900"
              />
              <button
                onClick={handleAddTileService}
                disabled={!tileServiceUrl.trim()}
                className="w-full rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Adicionar tiles persistentes
              </button>
            </div>
          </div>
        )}

        {/* ── Sub-Section 1: Ferramentas Vetoriais ──────────────────────────────── */}
        {activeTab === "vector_toolbox" && (
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
                    GeoJSON, CSV lat/lon, Shapefile, GeoPackage, GeoParquet, KML e outros formatos suportados pelo importador.
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
                    Ferramenta Vetorial
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
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Whitebox WASM · Catálogo verificado</span>
                <span className="text-[9px] font-bold rounded-full bg-white/80 dark:bg-slate-900/70 px-2 py-0.5 border border-sky-200 dark:border-sky-800">
                  {whiteboxLoading ? "a carregar…" : `${whiteboxTools.length} ferramentas verificadas`}
                </span>
              </div>
              <p className="mt-1">
                O GeoMoz valida o catálogo contra <code>whitebox-wasm</code> no browser
                e mostra apenas ferramentas com parâmetros definidos pela própria aplicação.
                As saídas regressam ao mesmo Workspace.
              </p>
            </div>

            {whiteboxError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-2.5 text-[11px] text-rose-700 dark:text-rose-300">
                <strong>Runtime indisponível:</strong> {whiteboxError}
              </div>
            )}

            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="Pesquisar nos manifests Whitebox…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-1 overflow-x-auto pb-1 text-[10px]">
              <button
                onClick={() => setToolCategoryFilter("all")}
                className={`px-2 py-1 rounded-md shrink-0 transition-colors ${
                  toolCategoryFilter === "all"
                    ? "bg-indigo-600 text-white font-bold"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                Todas
              </button>
              {whiteboxCategories.map((category) => {
                const id = category.toLowerCase();
                return (
                  <button
                    key={category}
                    onClick={() => setToolCategoryFilter(id)}
                    className={`px-2 py-1 rounded-md shrink-0 transition-colors ${
                      toolCategoryFilter === id
                        ? "bg-indigo-600 text-white font-bold"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            {whiteboxLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw size={18} className="animate-spin mx-auto mb-2" />
                A inicializar manifests Whitebox WASM…
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>{filteredWhiteboxTools.length} correspondência(s)</span>
                  {filteredWhiteboxTools.length > 250 && <span>a mostrar primeiras 250</span>}
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {filteredWhiteboxTools.slice(0, 250).map((tool) => {
                    const vectorSupport = whiteboxVectorSupport(tool);
                    const rasterSupport = whiteboxRasterSupport(tool);
                    const mode = vectorSupport.supported
                      ? "vector"
                      : rasterSupport.supported
                        ? "raster"
                        : null;
                    return (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setSelectedWhiteboxToolId(tool.id);
                          setWhiteboxParams(whiteboxManifestDefaults(tool));
                        }}
                        className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer ${
                          selectedWhiteboxToolId === tool.id
                            ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {whiteboxManifestName(tool)}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                              mode === "vector"
                                ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                : mode === "raster"
                                  ? "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                                  : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                            }`}
                          >
                            {mode === "vector"
                              ? "WASM vetorial"
                              : mode === "raster"
                                ? "WASM raster"
                                : tool.category ?? "WASM"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">
                          {tool.summary || tool.id}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {selectedWhiteboxTool && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                      {whiteboxManifestName(selectedWhiteboxTool)}
                    </h4>
                    <span className="text-[9px] font-mono text-slate-400">
                      {selectedWhiteboxTool.id}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {selectedWhiteboxTool.summary || "Ferramenta declarada pelo runtime Whitebox WASM."}
                  </p>
                </div>

                {selectedWhiteboxMode === "vector" && (
                  <>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Camada vetorial principal
                      </label>
                      <select
                        value={selectedLayerId}
                        onChange={(e) => setSelectedLayerId(e.target.value)}
                        className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2"
                      >
                        <option value="">Selecione…</option>
                        {layers.map((layer) => (
                          <option key={layer.id} value={layer.id}>
                            {layer.name} ({layer.featureCount})
                          </option>
                        ))}
                      </select>
                    </div>

                    {(selectedWhiteboxVectorSupport?.vectorInputs.length ?? 0) > 1 && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Segunda camada vetorial
                        </label>
                        <select
                          value={secondLayerId}
                          onChange={(e) => setSecondLayerId(e.target.value)}
                          className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2"
                        >
                          <option value="">Selecione…</option>
                          {layers
                            .filter((layer) => layer.id !== selectedLayerId)
                            .map((layer) => (
                              <option key={layer.id} value={layer.id}>
                                {layer.name} ({layer.featureCount})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {selectedWhiteboxMode === "raster" && (
                  <>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Raster principal
                      </label>
                      <select
                        value={selectedWhiteboxRasterId}
                        onChange={(e) => setSelectedWhiteboxRasterId(e.target.value)}
                        className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2"
                      >
                        <option value="">Selecione…</option>
                        {rasterLayers.map((layer) => (
                          <option key={layer.id} value={layer.id}>
                            {layer.name}
                            {layer.bandCount ? ` · ${layer.bandCount} banda(s)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(selectedWhiteboxRasterSupport?.rasterInputs.length ?? 0) > 1 && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Segundo raster
                        </label>
                        <select
                          value={secondWhiteboxRasterId}
                          onChange={(e) => setSecondWhiteboxRasterId(e.target.value)}
                          className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2"
                        >
                          <option value="">Selecione…</option>
                          {rasterLayers
                            .filter((layer) => layer.id !== selectedWhiteboxRasterId)
                            .map((layer) => (
                              <option key={layer.id} value={layer.id}>
                                {layer.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
                {(selectedWhiteboxTool.params ?? [])
                  .filter((parameter) => {
                    const kind = whiteboxParamKind(parameter);
                    return !kind.endsWith("_in") && !kind.endsWith("_out");
                  })
                  .map((parameter) => {
                    const kind = whiteboxParamKind(parameter);
                    const options = parameter.schema?.options ?? [];
                    const fallback = selectedWhiteboxTool.defaults?.[parameter.name] ?? "";
                    const value = whiteboxParams[parameter.name] ?? fallback;
                    const numeric = /^(int|integer|double|float|number)$/i.test(kind);
                    const boolean = /^bool(ean)?$/i.test(kind);

                    return (
                      <div key={parameter.name} className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          {parameter.name}
                          {parameter.required ? " *" : ""}
                        </label>
                        {parameter.description && (
                          <p className="text-[9px] text-slate-400">{parameter.description}</p>
                        )}
                        {boolean ? (
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(e) =>
                                setWhiteboxParams((previous) => ({
                                  ...previous,
                                  [parameter.name]: e.target.checked,
                                }))
                              }
                            />
                            <span>{Boolean(value) ? "true" : "false"}</span>
                          </label>
                        ) : options.length > 0 ? (
                          <select
                            value={String(value)}
                            onChange={(e) =>
                              setWhiteboxParams((previous) => ({
                                ...previous,
                                [parameter.name]: e.target.value,
                              }))
                            }
                            className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                          >
                            <option value="">Selecione…</option>
                            {options.map((option, index) => (
                              <option key={index} value={String(option.value ?? "")}>
                                {option.label ?? String(option.value ?? "")}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={numeric ? "number" : "text"}
                            value={String(value)}
                            onChange={(e) =>
                              setWhiteboxParams((previous) => ({
                                ...previous,
                                [parameter.name]: numeric
                                  ? e.target.value === ""
                                    ? ""
                                    : Number(e.target.value)
                                  : e.target.value,
                              }))
                            }
                            className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                          />
                        )}
                      </div>
                    );
                  })}

                {!selectedWhiteboxMode && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-2 text-[10px] text-amber-700 dark:text-amber-300">
                    {selectedWhiteboxRasterSupport?.reason ||
                      selectedWhiteboxVectorSupport?.reason ||
                      "Esta ferramenta ainda não está ligada ao tipo de camada atual."}
                  </div>
                )}

                {selectedWhiteboxMode === "raster" &&
                  selectedBackendRasterTool && (
                    <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/60 p-2.5 dark:border-orange-900 dark:bg-orange-950/20">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <div>
                          <span className="font-bold text-orange-800 dark:text-orange-300">
                            Backend GDAL
                          </span>
                          <p className="text-[9px] text-orange-700/80 dark:text-orange-400">
                            Recomendado para DEMs grandes ou quando não quiser consumir memória do browser.
                          </p>
                        </div>
                        {heavyJob && (
                          <span className="shrink-0 font-mono font-bold text-orange-700 dark:text-orange-300">
                            {heavyJob.progress}%
                          </span>
                        )}
                      </div>

                      {heavyJob && (
                        <div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950">
                            <div
                              className="h-full bg-orange-500 transition-all"
                              style={{
                                width: Math.max(2, Math.min(100, heavyJob.progress)) + "%",
                              }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between gap-2 text-[8px] text-slate-500">
                            <span>{heavyJob.message || heavyJob.status}</span>
                            <span>{heavyJob.status}</span>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleRunBackendRaster()}
                        disabled={isExecuting || !selectedWhiteboxRaster}
                        className="w-full rounded-lg bg-orange-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        {isExecuting && heavyJob ? "A processar no servidor…" : "Executar no Backend GDAL"}
                      </button>
                      {isExecuting &&
                        heavyJob &&
                        (heavyJob.status === "queued" || heavyJob.status === "running") && (
                          <button
                            type="button"
                            onClick={() => heavyJobAbortRef.current?.abort()}
                            className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
                          >
                            Cancelar job GDAL
                          </button>
                        )}
                    </div>
                  )}

                <button
                  onClick={() => void handleRunWhitebox()}
                  disabled={
                    isExecuting ||
                    !selectedWhiteboxMode ||
                    (selectedWhiteboxMode === "vector" &&
                      (!activeLayer ||
                        ((selectedWhiteboxVectorSupport?.vectorInputs.length ?? 0) > 1 &&
                          !secondaryLayer))) ||
                    (selectedWhiteboxMode === "raster" &&
                      (!selectedWhiteboxRaster ||
                        ((selectedWhiteboxRasterSupport?.rasterInputs.length ?? 0) > 1 &&
                          !secondaryWhiteboxRaster)))
                  }
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      A executar Whitebox WASM…
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Executar no browser
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Sub-Section 3: Model Builder híbrido ─────────────────────────── */}
        {activeTab === "model_builder" && (
          <div className="p-3 flex-1 min-w-0">
            {whiteboxLoading && whiteboxTools.length === 0 ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-center text-xs text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
                <RefreshCw size={16} className="mx-auto mb-2 animate-spin" />
                A carregar catálogo Whitebox WASM para o Model Builder…
              </div>
            ) : (
              <GISModelBuilderPanel
                graph={modelGraph}
                onGraphChange={setModelGraph}
                catalog={modelCatalog}
                vectorLayers={layers.map((layer) => ({
                  id: layer.id,
                  name: layer.name,
                }))}
                rasterLayers={rasterLayers.map((layer) => ({
                  id: layer.id,
                  name: layer.name,
                }))}
                running={isExecuting}
                nodeStatus={modelNodeStatus}
                log={modelLog}
                onRun={() => void handleRunModel()}
                onCancel={() => modelAbortRef.current?.abort()}
              />
            )}
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
                      Gerou {h.outputCount} {h.outputLabel ?? "feições"} via {h.engine}
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Camadas no Mapa ({layers.length + rasterLayers.length + serviceLayers.length})
              </span>
              <button
                onClick={() => setActiveTab("data_sources")}
                className="py-1 px-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={11} /> Adicionar dados
              </button>
            </div>

            {serviceLayers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Globe2 size={12} />
                  <span>Serviços remotos</span>
                </div>
                {serviceLayers.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-xl border border-cyan-200/80 bg-cyan-50/40 p-2.5 dark:border-cyan-900/60 dark:bg-cyan-950/20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {service.name}
                        </div>
                        <div className="mt-0.5 truncate text-[9px] text-slate-400">
                          {service.type.toUpperCase()} · {service.metadata?.sourceLabel || service.endpoint}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setServiceLayers((previous) =>
                              previous.map((item) =>
                                item.id === service.id
                                  ? { ...item, visible: !item.visible }
                                  : item
                              )
                            )
                          }
                          className="p-1 text-slate-400 hover:text-slate-700"
                          title={service.visible ? "Ocultar serviço" : "Mostrar serviço"}
                        >
                          {service.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                          onClick={() =>
                            setServiceLayers((previous) =>
                              previous.filter((item) => item.id !== service.id)
                            )
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Remover serviço"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="w-12 text-[10px] text-slate-400">Opacidade</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={service.opacity}
                        onChange={(event) => {
                          const opacity = Number(event.target.value);
                          setServiceLayers((previous) =>
                            previous.map((item) =>
                              item.id === service.id ? { ...item, opacity } : item
                            )
                          );
                        }}
                        className="w-full accent-cyan-600"
                      />
                      <span className="w-8 text-right text-[10px] font-semibold text-slate-500">
                        {Math.round(service.opacity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rasterLayers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Mountain size={12} />
                  <span>Raster / COG</span>
                </div>
                {rasterLayers.map((raster) => (
                  <div
                    key={raster.id}
                    onClick={() => setSelectedWhiteboxRasterId(raster.id)}
                    className={`rounded-xl border p-2.5 transition-all cursor-pointer ${
                      selectedWhiteboxRasterId === raster.id
                        ? "border-sky-400 bg-sky-100/70 ring-1 ring-sky-300/60 dark:border-sky-700 dark:bg-sky-950/40"
                        : "border-sky-200/80 bg-sky-50/40 hover:border-sky-300 dark:border-sky-900/60 dark:bg-sky-950/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {raster.name}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {raster.bandCount
                            ? `${raster.bandCount} banda(s)`
                            : "a ler metadados…"}{" "}
                          · {(raster.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setRasterLayers((previous) =>
                              previous.map((item) =>
                                item.id === raster.id
                                  ? { ...item, visible: !item.visible }
                                  : item
                              )
                            )
                          }
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          title={raster.visible ? "Ocultar raster" : "Mostrar raster"}
                        >
                          {raster.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                          onClick={() =>
                            setRasterLayers((previous) =>
                              previous.filter((item) => item.id !== raster.id)
                            )
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Remover raster"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="w-12 text-[10px] text-slate-400">Opacidade</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={raster.opacity}
                        onChange={(event) => {
                          const opacity = Number(event.target.value);
                          setRasterLayers((previous) =>
                            previous.map((item) =>
                              item.id === raster.id ? { ...item, opacity } : item
                            )
                          );
                        }}
                        className="w-full accent-sky-600"
                      />
                      <span className="w-8 text-right text-[10px] font-semibold text-slate-500">
                        {Math.round(raster.opacity * 100)}%
                      </span>
                    </div>
                    {selectedWhiteboxRasterId === raster.id && (
                      <div className="mt-2 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-2 dark:border-emerald-900 dark:bg-emerald-950/20">
                        <div className="mb-1.5 flex items-center justify-between">
                          <div>
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              Análise de Terreno
                            </span>
                            <span className="text-[9px] text-slate-400">
                              DEM → derivados Whitebox WASM
                            </span>
                          </div>
                          <Mountain size={13} className="text-emerald-600" />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            disabled={whiteboxLoading || isExecuting}
                            onClick={() =>
                              void openTerrainWhiteboxTool("hillshade", raster.id)
                            }
                            className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-white px-1.5 py-2 text-[9px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-slate-300"
                          >
                            <Sparkles size={12} />
                            Hillshade
                          </button>
                          <button
                            type="button"
                            disabled={whiteboxLoading || isExecuting}
                            onClick={() =>
                              void openTerrainWhiteboxTool("slope", raster.id)
                            }
                            className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-white px-1.5 py-2 text-[9px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-slate-300"
                          >
                            <Mountain size={12} />
                            Declive
                          </button>
                          <button
                            type="button"
                            disabled={whiteboxLoading || isExecuting}
                            onClick={() =>
                              void openTerrainWhiteboxTool("aspect", raster.id)
                            }
                            className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-white px-1.5 py-2 text-[9px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-slate-300"
                          >
                            <Compass size={12} />
                            Aspeto
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedWhiteboxRasterId === raster.id &&
                      (() => {
                        const state = raster.rasterState ?? {};
                        const mode = state.mode === "rgb" ? "rgb" : "single";
                        const bands = state.bands?.length ? state.bands : [1];
                        const bandCount = Math.max(raster.bandCount ?? 1, 1);
                        const bandOptions = Array.from(
                          { length: bandCount },
                          (_, index) => index + 1
                        );
                        const colormap = state.colormap ?? "viridis";
                        const stretch = state.stretch ?? "linear";
                        const gamma = state.gamma ?? 1;
                        const statsBand = bands[0] ?? 1;
                        const currentStatsKey = rasterStatsKey(raster.id, statsBand);
                        const stats = rasterBandStats[currentStatsKey];
                        const statsLoading = rasterStatsLoadingKey === currentStatsKey;
                        const statsError = rasterStatsErrors[currentStatsKey];
                        const autoRange = stats ? autoGISRasterStretch(stats) : null;
                        const savedRange = state.rescale?.[0] ?? null;
                        const effectiveRange = savedRange ?? autoRange;
                        const histogramPeak = stats
                          ? Math.max(1, ...stats.histogram)
                          : 1;
                        const rgbBands = [
                          bands[0] ?? 1,
                          bands[1] ?? Math.min(2, bandCount),
                          bands[2] ?? Math.min(3, bandCount),
                        ];
                        const rgbStats = rgbBands.map(
                          (band) => rasterBandStats[rasterStatsKey(raster.id, band)] ?? null
                        );
                        const rgbAutoRanges = rgbStats.map((channelStats) =>
                          channelStats ? autoGISRasterStretch(channelStats) : null
                        );
                        const rgbStatsReady = rgbAutoRanges.every(
                          (range): range is [number, number] => range !== null
                        );
                        const nodata =
                          state.nodata === "off" || typeof state.nodata === "number"
                            ? state.nodata
                            : "auto";
                        const symbology = raster.rasterSymbology;
                        const classColors = symbology
                          ? rasterClassColors(symbology)
                          : [];

                        return (
                          <div
                            className="mt-2 space-y-2 rounded-xl border border-sky-200/80 bg-white/80 p-2 dark:border-sky-900 dark:bg-slate-900/70"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                                Visualização Raster
                              </span>
                              <span className="text-[9px] text-slate-400">
                                {mode === "rgb" ? "Composição RGB" : "Banda única"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-[9px] font-semibold text-slate-500">
                                  Modo
                                </span>
                                <select
                                  value={mode}
                                  onChange={(event) => {
                                    const nextMode = event.target.value as "single" | "rgb";
                                    updateRasterState(raster.id, {
                                      mode: nextMode,
                                      bands:
                                        nextMode === "rgb"
                                          ? [
                                              1,
                                              Math.min(2, bandCount),
                                              Math.min(3, bandCount),
                                            ]
                                          : [bands[0] ?? 1],
                                    });
                                  }}
                                  className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                >
                                  <option value="single">Banda única</option>
                                  {bandCount >= 3 && <option value="rgb">RGB</option>}
                                </select>
                              </label>

                              {mode === "single" && (
                                <label className="space-y-1">
                                  <span className="text-[9px] font-semibold text-slate-500">
                                    Banda
                                  </span>
                                  <select
                                    value={bands[0] ?? 1}
                                    onChange={(event) =>
                                      updateRasterState(raster.id, {
                                        bands: [Number(event.target.value)],
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                  >
                                    {bandOptions.map((band) => (
                                      <option key={band} value={band}>
                                        Banda {band}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                            </div>

                            {mode === "single" && (
                              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2 dark:border-violet-900 dark:bg-violet-950/20">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <span className="block text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                                      Classificação Raster
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      Classes discretas e legenda persistente
                                    </span>
                                  </div>
                                  <label className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={symbology?.classified === true}
                                      disabled={!stats}
                                      onChange={(event) => {
                                        if (!stats) return;
                                        if (!event.target.checked) {
                                          updateRasterSymbology(
                                            raster.id,
                                            symbology
                                              ? { ...symbology, classified: false }
                                              : undefined
                                          );
                                          return;
                                        }
                                        const next = symbology
                                          ? { ...symbology, classified: true }
                                          : {
                                              ...defaultGISRasterSymbology(
                                                stats,
                                                colormap
                                              ),
                                              classified: true,
                                            };
                                        updateRasterSymbology(raster.id, next);
                                        updateRasterState(raster.id, {
                                          mode: "single",
                                          bands: [statsBand],
                                          rescale: [[stats.min, stats.max]],
                                        });
                                      }}
                                    />
                                    Classificar
                                  </label>
                                </div>

                                {!stats && (
                                  <div className="text-[9px] text-slate-400">
                                    As estatísticas da banda são necessárias antes de criar classes.
                                  </div>
                                )}

                                {stats && symbology?.classified && (
                                  <>
                                    <div className="grid grid-cols-2 gap-2">
                                      <label className="space-y-1">
                                        <span className="text-[9px] font-semibold text-slate-500">
                                          Método
                                        </span>
                                        <select
                                          value={symbology.method}
                                          onChange={(event) => {
                                            const method = event.target.value as
                                              | "equal-interval"
                                              | "quantile"
                                              | "manual";
                                            updateRasterSymbology(raster.id, {
                                              ...symbology,
                                              method,
                                              breaks: computeGISRasterBreaks(
                                                method,
                                                stats,
                                                symbology.classCount,
                                                symbology.breaks
                                              ),
                                            });
                                          }}
                                          className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                                        >
                                          <option value="equal-interval">
                                            Intervalos iguais
                                          </option>
                                          <option value="quantile">Quantis</option>
                                          <option value="manual">Manual</option>
                                        </select>
                                      </label>

                                      <label className="space-y-1">
                                        <span className="text-[9px] font-semibold text-slate-500">
                                          Classes
                                        </span>
                                        <input
                                          type="number"
                                          min={2}
                                          max={12}
                                          value={symbology.classCount}
                                          onChange={(event) => {
                                            const classCount = Math.max(
                                              2,
                                              Math.min(
                                                12,
                                                Number(event.target.value) || 2
                                              )
                                            );
                                            updateRasterSymbology(raster.id, {
                                              ...symbology,
                                              classCount,
                                              customColors: undefined,
                                              breaks: computeGISRasterBreaks(
                                                symbology.method,
                                                stats,
                                                classCount,
                                                symbology.breaks
                                              ),
                                            });
                                          }}
                                          className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                                        />
                                      </label>
                                    </div>

                                    {symbology.method === "manual" && (
                                      <div className="space-y-1">
                                        <span className="text-[9px] font-semibold text-slate-500">
                                          Limites das classes
                                        </span>
                                        <div className="grid grid-cols-2 gap-1.5">
                                          {symbology.breaks.map((value, index) => (
                                            <input
                                              key={index}
                                              type="number"
                                              step="any"
                                              value={value}
                                              onChange={(event) => {
                                                const nextValue = Number(
                                                  event.target.value
                                                );
                                                if (!Number.isFinite(nextValue)) return;
                                                const breaks = [...symbology.breaks];
                                                breaks[index] = nextValue;
                                                const sorted = [...breaks].sort(
                                                  (a, b) => a - b
                                                );
                                                updateRasterSymbology(raster.id, {
                                                  ...symbology,
                                                  breaks: sorted,
                                                });
                                                updateRasterState(raster.id, {
                                                  rescale: [
                                                    [
                                                      sorted[0],
                                                      sorted[sorted.length - 1],
                                                    ],
                                                  ],
                                                });
                                              }}
                                              className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[9px] dark:border-slate-700 dark:bg-slate-900"
                                              aria-label={`Limite ${index + 1}`}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-semibold text-slate-500">
                                          Legenda
                                        </span>
                                        {symbology.customColors && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateRasterSymbology(raster.id, {
                                                ...symbology,
                                                customColors: undefined,
                                              })
                                            }
                                            className="text-[9px] font-semibold text-violet-600 hover:underline dark:text-violet-300"
                                          >
                                            Repor paleta
                                          </button>
                                        )}
                                      </div>
                                      <div className="max-h-44 space-y-1 overflow-auto pr-0.5">
                                        {symbology.breaks
                                          .slice(0, -1)
                                          .map((lower, index) => {
                                            const upper =
                                              symbology.breaks[index + 1];
                                            return (
                                              <div
                                                key={index}
                                                className="flex items-center gap-2 rounded-md bg-white px-1.5 py-1 dark:bg-slate-900"
                                              >
                                                <input
                                                  type="color"
                                                  value={
                                                    classColors[index] ??
                                                    "#2563eb"
                                                  }
                                                  onChange={(event) => {
                                                    const colors = [
                                                      ...classColors,
                                                    ];
                                                    colors[index] =
                                                      event.target.value;
                                                    updateRasterSymbology(
                                                      raster.id,
                                                      {
                                                        ...symbology,
                                                        customColors: colors,
                                                      }
                                                    );
                                                  }}
                                                  className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                                                  aria-label={`Cor da classe ${index + 1}`}
                                                />
                                                <span className="min-w-0 flex-1 truncate text-[9px] text-slate-600 dark:text-slate-300">
                                                  {formatRasterValue(lower)} –{" "}
                                                  {formatRasterValue(upper)}
                                                </span>
                                              </div>
                                            );
                                          })}
                                      </div>
                                    </div>

                                    <div className="rounded-md border border-violet-200/70 bg-white px-2 py-1.5 text-[9px] text-slate-500 dark:border-violet-900 dark:bg-slate-900 dark:text-slate-400">
                                      A classificação usa o motor GPU Deck.gl apenas
                                      quando está ativa; o restante raster continua no
                                      renderer padrão do Workspace.
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                            {mode === "rgb" && (
                              <div className="grid grid-cols-3 gap-1.5">
                                {(["R", "G", "B"] as const).map((channel, index) => (
                                  <label key={channel} className="space-y-1">
                                    <span className="text-[9px] font-semibold text-slate-500">
                                      {channel}
                                    </span>
                                    <select
                                      value={bands[index] ?? Math.min(index + 1, bandCount)}
                                      onChange={(event) => {
                                        const nextBands = [...bands];
                                        while (nextBands.length < 3) {
                                          nextBands.push(Math.min(nextBands.length + 1, bandCount));
                                        }
                                        nextBands[index] = Number(event.target.value);
                                        updateRasterState(raster.id, { bands: nextBands });
                                      }}
                                      className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                    >
                                      {bandOptions.map((band) => (
                                        <option key={band} value={band}>
                                          {band}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            )}

                            {mode === "single" && (
                              <div className="grid grid-cols-2 gap-2">
                                <label className="space-y-1">
                                  <span className="text-[9px] font-semibold text-slate-500">
                                    Paleta
                                  </span>
                                  <select
                                    value={colormap}
                                    onChange={(event) =>
                                      updateRasterState(raster.id, {
                                        colormap: event.target.value,
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                  >
                                    <option value="viridis">Viridis</option>
                                    <option value="terrain">Terrain</option>
                                    <option value="turbo">Turbo</option>
                                    <option value="magma">Magma</option>
                                    <option value="plasma">Plasma</option>
                                    <option value="gray">Grayscale</option>
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[9px] font-semibold text-slate-500">
                                    Stretch
                                  </span>
                                  <select
                                    value={stretch}
                                    onChange={(event) =>
                                      updateRasterState(raster.id, {
                                        stretch: event.target.value as
                                          | "linear"
                                          | "log"
                                          | "sqrt",
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                  >
                                    <option value="linear">Linear</option>
                                    <option value="sqrt">Raiz quadrada</option>
                                    <option value="log">Logarítmico</option>
                                  </select>
                                </label>
                              </div>
                            )}

                            {mode === "single" && (
                              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                      Histograma · Banda {statsBand}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      {savedRange ? "Range fixado" : "Auto stretch 2–98%"}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const controller = new AbortController();
                                      void loadRasterBandStats(raster, statsBand, controller.signal);
                                    }}
                                    className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-sky-600 dark:hover:bg-slate-700"
                                    title="Recalcular estatísticas"
                                  >
                                    <RefreshCw
                                      size={11}
                                      className={statsLoading ? "animate-spin" : ""}
                                    />
                                  </button>
                                </div>

                                {statsLoading && !stats && (
                                  <div className="flex h-12 items-center justify-center text-[9px] text-slate-400">
                                    <RefreshCw size={11} className="mr-1.5 animate-spin" />
                                    A calcular distribuição raster…
                                  </div>
                                )}

                                {stats && (
                                  <>
                                    <div className="flex h-12 items-end gap-px overflow-hidden rounded-md bg-white px-1 pt-1 dark:bg-slate-900">
                                      {stats.histogram.map((count, index) => (
                                        <span
                                          key={index}
                                          className="min-w-px flex-1 rounded-t-[1px] bg-sky-500/70"
                                          style={{
                                            height: `${Math.max(
                                              2,
                                              (count / histogramPeak) * 100
                                            )}%`,
                                          }}
                                          title={`${count} amostras`}
                                        />
                                      ))}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                                      <div className="rounded-md bg-white px-2 py-1 dark:bg-slate-900">
                                        <span className="text-slate-400">Mínimo</span>
                                        <span className="block font-semibold text-slate-700 dark:text-slate-200">
                                          {formatRasterValue(stats.min)}
                                        </span>
                                      </div>
                                      <div className="rounded-md bg-white px-2 py-1 dark:bg-slate-900">
                                        <span className="text-slate-400">Máximo</span>
                                        <span className="block font-semibold text-slate-700 dark:text-slate-200">
                                          {formatRasterValue(stats.max)}
                                        </span>
                                      </div>
                                    </div>

                                    {effectiveRange && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <label className="space-y-1">
                                          <span className="text-[9px] font-semibold text-slate-500">
                                            Stretch mín.
                                          </span>
                                          <input
                                            type="number"
                                            value={effectiveRange[0]}
                                            step="any"
                                            onChange={(event) => {
                                              const low = Number(event.target.value);
                                              const high = effectiveRange[1];
                                              if (Number.isFinite(low) && low < high) {
                                                updateRasterState(raster.id, {
                                                  rescale: [[low, high]],
                                                });
                                              }
                                            }}
                                            className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                                          />
                                        </label>
                                        <label className="space-y-1">
                                          <span className="text-[9px] font-semibold text-slate-500">
                                            Stretch máx.
                                          </span>
                                          <input
                                            type="number"
                                            value={effectiveRange[1]}
                                            step="any"
                                            onChange={(event) => {
                                              const high = Number(event.target.value);
                                              const low = effectiveRange[0];
                                              if (Number.isFinite(high) && high > low) {
                                                updateRasterState(raster.id, {
                                                  rescale: [[low, high]],
                                                });
                                              }
                                            }}
                                            className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                                          />
                                        </label>
                                      </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateRasterState(raster.id, { rescale: null })
                                        }
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                      >
                                        Auto 2–98%
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!autoRange}
                                        onClick={() => {
                                          if (!autoRange) return;
                                          updateRasterState(raster.id, {
                                            rescale: [[autoRange[0], autoRange[1]]],
                                          });
                                        }}
                                        className="rounded-lg bg-sky-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                                      >
                                        Fixar range atual
                                      </button>
                                    </div>
                                  </>
                                )}

                                {statsError && !statsLoading && (
                                  <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                    Estatísticas indisponíveis: {statsError}
                                  </div>
                                )}
                              </div>
                            )}

                            {mode === "rgb" && (
                              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                    Estatísticas RGB
                                  </span>
                                  <span className="text-[9px] text-slate-400">
                                    {state.rescale ? "Range fixado" : "Auto 2–98%"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {(["R", "G", "B"] as const).map((channel, index) => {
                                    const channelStats = rgbStats[index];
                                    return (
                                      <div
                                        key={channel}
                                        className="rounded-md bg-white px-1.5 py-1.5 text-[9px] dark:bg-slate-900"
                                      >
                                        <span className="font-bold text-slate-500">{channel}</span>
                                        <span className="block truncate text-slate-400">
                                          B{rgbBands[index]}
                                        </span>
                                        {channelStats ? (
                                          <span className="block font-semibold text-slate-700 dark:text-slate-200">
                                            {formatRasterValue(channelStats.min)} –{" "}
                                            {formatRasterValue(channelStats.max)}
                                          </span>
                                        ) : (
                                          <span className="block text-slate-400">a calcular…</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRasterState(raster.id, { rescale: null })
                                    }
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                  >
                                    Auto RGB
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!rgbStatsReady}
                                    onClick={() => {
                                      if (!rgbStatsReady) return;
                                      updateRasterState(raster.id, {
                                        rescale: rgbAutoRanges as [number, number][],
                                      });
                                    }}
                                    className="rounded-lg bg-sky-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                                  >
                                    Fixar 2–98%
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-[9px] font-semibold text-slate-500">
                                  NoData
                                </span>
                                <select
                                  value={typeof nodata === "number" ? "custom" : nodata}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    updateRasterState(raster.id, {
                                      nodata:
                                        value === "off"
                                          ? "off"
                                          : value === "custom"
                                            ? 0
                                            : "auto",
                                    });
                                  }}
                                  className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                >
                                  <option value="auto">Automático</option>
                                  <option value="off">Não aplicar</option>
                                  <option value="custom">Valor definido</option>
                                </select>
                              </label>
                              {typeof nodata === "number" ? (
                                <label className="space-y-1">
                                  <span className="text-[9px] font-semibold text-slate-500">
                                    Valor NoData
                                  </span>
                                  <input
                                    type="number"
                                    step="any"
                                    value={nodata}
                                    onChange={(event) => {
                                      const value = Number(event.target.value);
                                      if (Number.isFinite(value)) {
                                        updateRasterState(raster.id, { nodata: value });
                                      }
                                    }}
                                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800"
                                  />
                                </label>
                              ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 px-2 py-1.5 text-[9px] text-slate-400 dark:border-slate-700">
                                  {nodata === "auto"
                                    ? "Usa o NoData definido no GeoTIFF."
                                    : "Todos os valores permanecem visíveis."}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="w-12 text-[9px] font-semibold text-slate-500">
                                Gamma
                              </span>
                              <input
                                type="range"
                                min={0.2}
                                max={3}
                                step={0.1}
                                value={gamma}
                                onChange={(event) =>
                                  updateRasterState(raster.id, {
                                    gamma: Number(event.target.value),
                                  })
                                }
                                className="w-full accent-sky-600"
                              />
                              <span className="w-8 text-right text-[9px] font-semibold text-slate-500">
                                {Number(gamma).toFixed(1)}
                              </span>
                            </div>

                            {mode === "single" && (
                              <label className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={state.reversed === true}
                                  onChange={(event) =>
                                    updateRasterState(raster.id, {
                                      reversed: event.target.checked,
                                    })
                                  }
                                />
                                Inverter paleta
                              </label>
                            )}
                          </div>
                        );
                      })()}

                    {raster.error && (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                        {raster.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {layers.length > 0 && (rasterLayers.length > 0 || serviceLayers.length > 0) && (
              <div className="flex items-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Layers size={12} />
                <span>Vetores</span>
              </div>
            )}

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
        style={{
          left: desktopSidebarOpen
            ? activeTab === "model_builder"
              ? "min(72vw, 980px)"
              : "24rem"
            : "0px",
        }}
        title={desktopSidebarOpen ? "Recolher painel" : "Expandir painel"}
        className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
      >
        {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* ── Main MapLibre GIS Workspace View ─────────────────────────────── */}
      <div className="flex-1 relative flex flex-col">
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
          rasterLayers={rasterLayers}
          serviceLayers={serviceLayers}
          activeLayerId={selectedLayerId}
          activeRasterId={selectedWhiteboxRasterId}
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
          onRasterMetadata={handleRasterMetadata}
          onRasterError={handleRasterError}
        />

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

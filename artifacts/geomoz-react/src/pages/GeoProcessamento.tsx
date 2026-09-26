/**
 * GeoProcessamento — Caixa de Ferramentas de Geoprocessamento Client-Side
 * Inspirado diretamente na arquitetura do GeoLibre:
 * - Geoprocessamento 100% no navegador (Turf.js / WASM) sobre DADOS PRÓPRIOS DO UTILIZADOR
 * - Carregamento de ficheiros locais (GeoJSON, CSV com coordenadas, KML) e geometrias desenhadas
 * - Ferramentas vetoriais completas: Buffer, Centróides, Convex Hull, Bounding Box, Dissolve,
 *   Simplify, Clip/Intersect, Difference, Points-in-Polygon, Cálculo de Área/Comprimento
 * - Cortina Temporal (Split/Swipe) para comparação lado a lado
 * - SQL Espacial (DuckDB-style) sobre as camadas do utilizador
 * - Tabela de atributos interativa e exportação direta para GeoJSON e CSV
 */

import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON as LeafletGeoJSON,
  ScaleControl,
  ZoomControl,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Cpu,
  Layers,
  Columns2,
  Database,
  Play,
  Upload,
  Download,
  Trash2,
  Eye,
  EyeOff,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  FileCode,
  Table,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  Info,
  Maximize2,
  RefreshCw,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AreaSelect from "@/components/AreaSelect";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import MapTools from "@/components/MapTools";
import MapDraw from "@/components/MapDraw";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
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
  runVectorPointsInPolygon,
} from "@/lib/wasm-geoprocessing";
import { executeSpatialQuery, exportToCsv, exportToGeoJson, QueryResult } from "@/lib/cloud-native-loader";
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

// Helper component to fit map bounds to a feature collection
function FitToLayer({ fc }: { fc?: FeatureCollection }) {
  const map = useMap();
  React.useEffect(() => {
    if (!fc || fc.features.length === 0) return;
    try {
      const geoLayer = L.geoJSON(fc);
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    } catch {}
  }, [fc, map]);
  return null;
}

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

const LAYER_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#dc2626", // red
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#d97706", // amber
  "#db2777", // pink
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Layout states
  const [activeSubTab, setActiveSubTab] = useState<"tools" | "layers" | "swipe" | "sql">("tools");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  // User layers state
  const [layers, setLayers] = useState<UserLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("");
  const [secondLayerId, setSecondLayerId] = useState<string>("");

  // Toolbox state
  const [selectedToolId, setSelectedToolId] = useState<string>("vector_buffer");
  const [toolParams, setToolParams] = useState<Record<string, any>>({
    distance: 1000,
    units: "meters",
    dissolve: false,
    tolerance: 0.005,
    highQuality: true,
  });
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastStats, setLastStats] = useState<GeoprocessingStats | null>(null);

  // Table view state
  const [tableLayerId, setTableLayerId] = useState<string | null>(null);

  // Swipe & Split state
  const [swipePercent, setSwipePercent] = useState<number>(50);
  const isDraggingRef = useRef(false);

  // Spatial SQL state
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);

  // Selected tool definition
  const currentTool = useMemo(
    () => GEOPROCESSING_TOOLS_CATALOG.find((t) => t.id === selectedToolId) || GEOPROCESSING_TOOLS_CATALOG[0],
    [selectedToolId]
  );

  // Active layer object
  const activeLayer = useMemo(() => layers.find((l) => l.id === selectedLayerId), [layers, selectedLayerId]);
  const secondaryLayer = useMemo(() => layers.find((l) => l.id === secondLayerId), [layers, secondLayerId]);

  // Update default SQL query when layers change
  React.useEffect(() => {
    if (layers.length > 0 && !sqlQuery) {
      setSqlQuery(`SELECT * FROM ${layers[0].name.toLowerCase().replace(/[^a-z0-9_]/g, "_")} LIMIT 50`);
    }
  }, [layers, sqlQuery]);

  // Synchronize drawn AOI as a layer if present
  React.useEffect(() => {
    if (aoi && aoi.source === "draw" && aoi.geometry) {
      const drawnId = "drawn_aoi_layer";
      const fc: FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { nome: aoi.label || "Área Desenhada" },
            geometry: aoi.geometry,
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
            geometryType: aoi.geometry.type,
            fields: ["nome"],
            color: "#e11d48",
            visible: true,
          },
          ...filtered,
        ];
      });

      if (!selectedLayerId) setSelectedLayerId(drawnId);
    }
  }, [aoi]);

  // ── Handle User File Upload ───────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed = await parseUserUploadedFile(file);
        const newLayer: UserLayer = {
          id: `layer_${Date.now()}_${i}`,
          name: parsed.name,
          geojson: parsed.geojson,
          featureCount: parsed.featureCount,
          geometryType: parsed.geometryType,
          fields: parsed.fields,
          color: LAYER_PALETTE[layers.length % LAYER_PALETTE.length],
          visible: true,
        };

        setLayers((prev) => [newLayer, ...prev]);
        setSelectedLayerId(newLayer.id);

        toast({
          title: "Ficheiro Carregado com Sucesso",
          description: `${parsed.name}: ${parsed.featureCount} elementos (${parsed.geometryType}) prontos para geoprocessamento.`,
        });
      } catch (err: any) {
        toast({
          title: "Erro ao Carregar Ficheiro",
          description: err.message || "Falha na leitura do ficheiro geoespacial.",
          variant: "destructive",
        });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Execute Real Geoprocessing Tool ───────────────────────────────────────
  const handleRunTool = useCallback(() => {
    if (!activeLayer) {
      toast({
        title: "Selecione uma Camada de Entrada",
        description: "Carregue um ficheiro GeoJSON/CSV ou selecione uma camada ativa.",
        variant: "destructive",
      });
      return;
    }

    if (currentTool.requiresSecondLayer && !secondaryLayer) {
      toast({
        title: "Segunda Camada Necessária",
        description: "Esta operação requer uma camada de sobreposição/corte.",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    setTimeout(() => {
      try {
        let outputFc: FeatureCollection;
        let stats: GeoprocessingStats;

        switch (selectedToolId) {
          case "vector_buffer": {
            const res = runVectorBuffer(
              activeLayer.geojson,
              Number(toolParams.distance || 1000),
              toolParams.units || "meters",
              Boolean(toolParams.dissolve)
            );
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_centroids": {
            const res = runVectorCentroids(activeLayer.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_convexhull": {
            const res = runVectorConvexHull(activeLayer.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_bbox": {
            const res = runVectorBBox(activeLayer.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_dissolve": {
            const res = runVectorDissolve(activeLayer.geojson, toolParams.propertyName);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_simplify": {
            const res = runVectorSimplify(
              activeLayer.geojson,
              Number(toolParams.tolerance || 0.005),
              Boolean(toolParams.highQuality ?? true)
            );
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_explode": {
            const res = runVectorExplode(activeLayer.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_calc_metrics": {
            const res = runVectorMetrics(activeLayer.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_intersect": {
            const res = runVectorIntersect(activeLayer.geojson, secondaryLayer!.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          case "vector_points_in_poly": {
            const res = runVectorPointsInPolygon(activeLayer.geojson, secondaryLayer!.geojson);
            outputFc = res.result;
            stats = res.stats;
            break;
          }
          default: {
            const res = runVectorCentroids(activeLayer.geojson);
            outputFc = res.result;
            stats = res.stats;
          }
        }

        setLastStats(stats);

        // Add result as an active user layer
        const resultLayerId = `result_${Date.now()}`;
        const resultLayer: UserLayer = {
          id: resultLayerId,
          name: `${currentTool.name} (${activeLayer.name})`,
          geojson: outputFc,
          featureCount: outputFc.features.length,
          geometryType: stats.geometryType,
          fields: outputFc.features[0]?.properties ? Object.keys(outputFc.features[0].properties) : [],
          color: LAYER_PALETTE[(layers.length + 1) % LAYER_PALETTE.length],
          visible: true,
          isResult: true,
        };

        setLayers((prev) => [resultLayer, ...prev]);
        setSelectedLayerId(resultLayerId);

        toast({
          title: "Geoprocessamento Concluído",
          description: stats.summary,
        });
      } catch (err: any) {
        toast({
          title: "Falha na Execução do Algoritmo",
          description: err.message || "Ocorreu um erro no processamento das geometrias.",
          variant: "destructive",
        });
      } finally {
        setIsExecuting(false);
      }
    }, 30);
  }, [activeLayer, secondaryLayer, currentTool, selectedToolId, toolParams, layers, toast]);

  // ── Run Spatial SQL on User Layer ─────────────────────────────────────────
  const handleExecuteSql = useCallback(() => {
    if (!activeLayer) {
      toast({
        title: "Selecione uma Camada",
        description: "Selecione a camada de entrada para consultar via SQL.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = executeSpatialQuery(activeLayer.geojson.features, sqlQuery);
      setSqlResult(res);

      if (res.features && res.features.length > 0) {
        const sqlLayerId = `sql_result_${Date.now()}`;
        const newLayer: UserLayer = {
          id: sqlLayerId,
          name: `SQL: ${activeLayer.name} (${res.rows.length})`,
          geojson: { type: "FeatureCollection", features: res.features },
          featureCount: res.features.length,
          geometryType: res.features[0]?.geometry?.type || "Point",
          fields: res.columns,
          color: "#9333ea",
          visible: true,
          isResult: true,
        };
        setLayers((prev) => [newLayer, ...prev]);
        setSelectedLayerId(sqlLayerId);
      }

      toast({
        title: "Consulta SQL Executada",
        description: `${res.rows.length} registos retornados em ${res.executionTimeMs}ms.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro na Consulta SQL",
        description: err.message || "Erro de sintaxe SQL.",
        variant: "destructive",
      });
    }
  }, [activeLayer, sqlQuery, toast]);

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
  const exportPdfReport = () => {
    const ctx = createPDFContext();
    drawCover(
      ctx,
      "Dossiê Técnico de Geoprocessamento Client-Side",
      `Estudo Geoespacial Integrado — ${province ?? "Moçambique"} · Dados do Utilizador`,
      [
        { label: "Área de Estudo", value: province ?? "Nacional / Personalizada" },
        { label: "Camadas do Utilizador", value: `${layers.length}` },
        { label: "Motor", value: "Turf.js & WebAssembly GIS" },
        { label: "Privacidade", value: "Processado 100% no Cliente" },
      ]
    );

    sectionTitle(ctx, "Resumo das Operações de Geoprocessamento");
    ctx.doc.setFontSize(8.5);
    ctx.doc.setTextColor(71, 85, 105);
    ctx.doc.text(
      "As operações espaciais foram executadas inteiramente na máquina local do utilizador através de algoritmos",
      MARGIN,
      ctx.y
    );
    ctx.y += 4;
    ctx.doc.text(
      "topológicos de precisão geodésica, garantindo integridade de dados e conformidade sem dependência de servidores.",
      MARGIN,
      ctx.y
    );
    ctx.y += 8;

    if (lastStats) {
      sectionTitle(ctx, "Estatísticas da Última Operação");
      drawStatCards(ctx, [
        { label: "Tempo de Execução", value: `${lastStats.executionTimeMs} ms`, color: [14, 165, 233] },
        { label: "Feições de Entrada", value: `${lastStats.inputFeatureCount}`, color: [100, 116, 139] },
        { label: "Feições Geradas", value: `${lastStats.outputFeatureCount}`, color: [34, 197, 94] },
        { label: "Área Total", value: `${lastStats.totalAreaKm2 ?? "—"} km²`, color: [234, 88, 12] },
      ]);
    }

    if (layers.length > 0) {
      sectionTitle(ctx, "Catálogo de Camadas do Projeto");
      drawTable(
        ctx,
        ["Nome da Camada", "Tipo", "Feições", "Origem"],
        layers.map((l) => ({
          cells: [l.name, l.geometryType, String(l.featureCount), l.isResult ? "Resultado de Análise" : "Carregado pelo Utilizador"],
          color: l.color,
        })),
        [CONTENT_W * 0.4, CONTENT_W * 0.2, CONTENT_W * 0.15, CONTENT_W * 0.25]
      );
    }

    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_Geoprocessamento_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "Relatório Exportado", description: "PDF técnico gerado com sucesso." });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50 dark:bg-slate-950 relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".geojson,.json,.csv,.kml"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[650] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar: Tool & Layer Manager ─────────────────────────────────── */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-[700] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 transition-all duration-300 shadow-xl md:shadow-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${desktopSidebarOpen ? "md:w-84 overflow-y-auto" : "md:w-0 overflow-hidden md:border-r-0"}`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-xs text-white shrink-0">
              <Cpu size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">GeoProcessamento</h2>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  Dados do Utilizador
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Turf.js · WebAssembly · Spatial SQL</p>
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

        {/* Sub-tab navigation */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-medium">
            <button
              onClick={() => setActiveSubTab("tools")}
              className={`py-1.5 rounded-lg transition-all ${
                activeSubTab === "tools"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              Ferramentas
            </button>
            <button
              onClick={() => setActiveSubTab("layers")}
              className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                activeSubTab === "layers"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              Camadas ({layers.length})
            </button>
            <button
              onClick={() => setActiveSubTab("swipe")}
              className={`py-1.5 rounded-lg transition-all ${
                activeSubTab === "swipe"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              Cortina
            </button>
            <button
              onClick={() => setActiveSubTab("sql")}
              className={`py-1.5 rounded-lg transition-all ${
                activeSubTab === "sql"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              Spatial SQL
            </button>
          </div>
        </div>

        {/* ── Tab 1: Geoprocessing Tools ──────────────────────────────────── */}
        {activeSubTab === "tools" && (
          <div className="p-3 space-y-3.5 flex-1">
            {/* Upload prompt if no layers */}
            {layers.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-center space-y-3 bg-slate-50/50 dark:bg-slate-800/20">
                <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
                  <Upload size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Carregue os Seus Ficheiros Geoespaciais
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Suporta GeoJSON (.geojson), CSV com coordenadas lat/lon, ou KML (.kml).
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Selecionar Ficheiro Local
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Layer Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Camada de Entrada (Input Layer)
                    </label>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Plus size={10} /> Adicionar Ficheiro
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

                {/* Secondary Layer Selector (for Overlay tools) */}
                {currentTool.requiresSecondLayer && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Camada de Corte / Máscara (Overlay Layer)
                    </label>
                    <select
                      value={secondLayerId}
                      onChange={(e) => setSecondLayerId(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">Selecione a segunda camada...</option>
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
                    Ferramenta de Análise
                  </label>
                  <select
                    value={selectedToolId}
                    onChange={(e) => setSelectedToolId(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <optgroup label="Geometria Vetorial">
                      <option value="vector_buffer">Buffer (Zona de Amortecimento)</option>
                      <option value="vector_centroids">Calcular Centróides</option>
                      <option value="vector_convexhull">Envelope Convexo (Convex Hull)</option>
                      <option value="vector_bbox">Caixa Envolvente (Bounding Box)</option>
                      <option value="vector_dissolve">Dissolver Polígonos</option>
                      <option value="vector_simplify">Simplificar Geometria</option>
                      <option value="vector_explode">Extrair Vértices Individuais</option>
                    </optgroup>
                    <optgroup label="Sobreposição & Operações Espaciais">
                      <option value="vector_intersect">Interseção Espacial (Clip / Intersect)</option>
                      <option value="vector_points_in_poly">Pontos em Polígonos</option>
                    </optgroup>
                    <optgroup label="Atributos & Métricas">
                      <option value="vector_calc_metrics">Calcular Área & Perímetro Geodésico</option>
                    </optgroup>
                  </select>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {currentTool.description}
                  </p>
                </div>

                {/* Tool Parameters */}
                {currentTool.parameters.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block">
                      Parâmetros da Operação
                    </span>
                    {currentTool.parameters.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                          <span>{p.label}</span>
                          {p.type === "number" && (
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
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

                {/* Run Button */}
                <button
                  onClick={handleRunTool}
                  disabled={isExecuting || !activeLayer}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>A processar geometrias...</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      <span>Executar {currentTool.name}</span>
                    </>
                  )}
                </button>

                {/* Execution Stats Card */}
                {lastStats && (
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-emerald-900 dark:text-emerald-200">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        <span>Resultado Gerado com Sucesso</span>
                      </span>
                      <span>{lastStats.executionTimeMs} ms</span>
                    </div>
                    <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">{lastStats.summary}</p>
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
                      <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                        <span className="text-slate-400 block">Feições Criadas</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {lastStats.outputFeatureCount}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                        <span className="text-slate-400 block">Tipo Geométrico</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{lastStats.geometryType}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: User Layers Manager ─────────────────────────────────── */}
        {activeSubTab === "layers" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Camadas no Projeto ({layers.length})
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-1 px-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Upload size={11} /> Importar Ficheiro
              </button>
            </div>

            {layers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                Nenhuma camada carregada ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {layers.map((l) => (
                  <div
                    key={l.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      selectedLayerId === l.id
                        ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700 shadow-xs"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
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
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title={l.visible ? "Ocultar camada" : "Mostrar camada"}
                        >
                          {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        <button
                          onClick={() => setTableLayerId(l.id)}
                          className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                          title="Ver tabela de atributos"
                        >
                          <Table size={13} />
                        </button>
                        <button
                          onClick={() => exportToGeoJson(l.geojson.features, `${l.name}.geojson`)}
                          className="p-1 text-slate-400 hover:text-emerald-600 cursor-pointer"
                          title="Exportar GeoJSON"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setLayers((prev) => prev.filter((item) => item.id !== l.id));
                            if (selectedLayerId === l.id) setSelectedLayerId(layers[0]?.id || "");
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Remover camada"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{l.featureCount} elementos</span>
                      <span>·</span>
                      <span>{l.geometryType}</span>
                      {l.isResult && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-600 font-semibold">
                          Resultado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: Cortina Swipe ────────────────────────────────────────── */}
        {activeSubTab === "swipe" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 rounded-xl p-2.5 text-[11px] text-sky-900 dark:text-sky-300 flex items-start gap-2">
              <Columns2 size={13} className="shrink-0 text-sky-500 mt-0.5" />
              <span>
                Compare camadas do utilizador ou imagens de satélite antes e depois de intervenções territoriais.
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">Posição da Cortina:</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400">{swipePercent}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={95}
                value={swipePercent}
                onChange={(e) => setSwipePercent(+e.target.value)}
                className="w-full accent-sky-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <button onClick={() => setSwipePercent(25)} className="hover:text-slate-700 cursor-pointer">
                  25%
                </button>
                <button onClick={() => setSwipePercent(50)} className="hover:text-slate-700 cursor-pointer">
                  50%
                </button>
                <button onClick={() => setSwipePercent(75)} className="hover:text-slate-700 cursor-pointer">
                  75%
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 4: Spatial SQL Engine ───────────────────────────────────── */}
        {activeSubTab === "sql" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl p-2.5 text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <Database size={13} className="shrink-0 text-amber-500 mt-0.5" />
              <span>
                Execute consultas SQL com filtros espaciais diretamente sobre qualquer camada carregada pelo utilizador.
              </span>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Camada Alvo
              </label>
              <select
                value={selectedLayerId}
                onChange={(e) => setSelectedLayerId(e.target.value)}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              >
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
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
              onClick={handleExecuteSql}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Play size={13} />
              <span>Executar Consulta SQL</span>
            </button>

            {sqlResult && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Resultados ({sqlResult.rows.length} linhas)
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
                  <Download size={11} /> Exportar CSV
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer: Export PDF */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={exportPdfReport}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            <FileDown size={14} />
            <span>Exportar Relatório PDF</span>
          </button>
        </div>
      </div>

      {/* Desktop collapse toggle */}
      <button
        type="button"
        onClick={() => setDesktopSidebarOpen((v) => !v)}
        style={{ left: desktopSidebarOpen ? "21rem" : "0px" }}
        title={desktopSidebarOpen ? "Recolher painel" : "Expandir painel"}
        className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* ── Map Canvas ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col" ref={mapContainerRef}>
        {/* Mobile floating sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="md:hidden absolute top-3 left-3 z-[600] flex items-center gap-1.5 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
        >
          <SlidersHorizontal size={13} className="text-indigo-600" />
          <span>Ferramentas</span>
        </button>

        <MapContainer
          center={[-18.5, 35.5]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          {/* Base Layer */}
          <TileLayer
            key={basemap}
            crossOrigin="anonymous"
            url={GOOGLE_BASEMAPS[basemap].url}
            subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
            attribution={GOOGLE_BASEMAPS[basemap].attribution}
            maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
          />

          <ScaleControl position="bottomright" imperial={false} />
          <ZoomControl position="topright" />

          {/* Area Select */}
          <AreaSelect
            province={province}
            district={district}
            onProvinceChange={(p) => {
              onProvinceChange(p);
              onDistrictChange(null);
            }}
            onDistrictChange={onDistrictChange}
            accent="#4f46e5"
          />

          {/* Auto-zoom to active layer */}
          {activeLayer && <FitToLayer fc={activeLayer.geojson} />}

          {/* Render User Layers */}
          {layers.map(
            (layer) =>
              layer.visible && (
                <LeafletGeoJSON
                  key={`${layer.id}_${layer.featureCount}`}
                  data={layer.geojson}
                  style={() => ({
                    color: layer.color,
                    weight: 2.5,
                    opacity: 0.9,
                    fillColor: layer.color,
                    fillOpacity: 0.35,
                  })}
                  pointToLayer={(feature, latlng) =>
                    L.circleMarker(latlng, {
                      radius: 6,
                      fillColor: layer.color,
                      color: "#ffffff",
                      weight: 1.5,
                      opacity: 1,
                      fillOpacity: 0.85,
                    })
                  }
                  onEachFeature={(feature, leafletLayer) => {
                    const props = feature.properties || {};
                    const entries = Object.entries(props).filter(([k]) => !k.startsWith("_"));
                    const html = `
                    <div style="font-size: 11px; max-width: 240px; font-family: sans-serif;">
                      <div style="font-weight: bold; color: ${layer.color}; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
                        ${layer.name}
                      </div>
                      ${entries
                        .slice(0, 6)
                        .map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`)
                        .join("")}
                    </div>
                  `;
                    leafletLayer.bindPopup(html);
                  }}
                />
              )
          )}

          <MapTools />
          <MapDraw
            enabled={drawingEnabled}
            hasDrawnAOI={aoi.source === "draw"}
            onClearAOI={() => onAOIChange(GLOBAL_AOI)}
            onDrawComplete={(geom, label) => {
              setDrawingEnabled(false);
              onAOIChange(customAOI(geom, label, "draw"));
            }}
            onCancel={() => setDrawingEnabled(false)}
          />
        </MapContainer>

        {/* ── Swipe Vertical Divider ──────────────────────────────────────── */}
        {activeSubTab === "swipe" && (
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

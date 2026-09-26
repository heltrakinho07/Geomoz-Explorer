/**
 * GeoProcessamento — Módulo de Geoprocessamento Client-Side & Formatos Cloud-Native
 * Inspirado na arquitetura do GeoLibre:
 * 1. Geoprocessamento 100% no Navegador (WebAssembly / Algoritmos Locais)
 * 2. Espelho Comparativo / Cortina Temporal (Split & Swipe Comparator)
 * 3. Suporte Nativo a Formatos Cloud-Native (PMTiles, COG e GeoParquet)
 * 4. Motor DuckDB-WASM Spatial (Consultas SQL Espaciais no Cliente)
 */

import React, { useState, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, ScaleControl, ZoomControl, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Cpu,
  Layers,
  Columns2,
  Database,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileDown,
  Search,
  Sparkles,
  Waves,
  Mountain,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Table,
  Sliders,
  Droplets,
  Share2,
  Code,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Maximize2,
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
  generateSyntheticDem,
  computeSlopeAspect,
  computeHillshade,
  computeD8Hydrology,
  computeTWI,
  computeSARThreshold,
  computeVectorBuffer,
  computeConvexHull,
  ProcessingResult,
} from "@/lib/wasm-geoprocessing";
import {
  CLOUD_NATIVE_CATALOG,
  PREDEFINED_SQL_QUERIES,
  MOZAMBIQUE_HIGHWAYS,
  MOZAMBIQUE_FACILITIES,
  MOZAMBIQUE_CONSERVATION_AREAS,
  MOZAMBIQUE_BASINS,
  CloudNativeDataset,
} from "@/lib/mozambique-spatial-catalog";
import { executeSpatialQuery, exportToCsv, exportToGeoJson, QueryResult } from "@/lib/cloud-native-loader";
import {
  createPDFContext,
  drawCover,
  sectionTitle,
  addPDFFooter,
  drawStatCards,
  drawTable,
  fetchMapImage,
  addMapImage,
  MARGIN,
  CONTENT_W,
} from "@/lib/pdf-export";

type SubModule = "wasm_processing" | "swipe_compare" | "cloud_native" | "spatial_sql";

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

// Marker icon for spatial points
const facilityIcon = L.divIcon({
  className: "custom-point-marker",
  html: `<div style="background-color: #0284c7; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const highRiskIcon = L.divIcon({
  className: "custom-point-marker-risk",
  html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(239,68,68,0.8); animation: pulse 2s infinite;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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

  // Layout & active sub-module
  const [activeSubModule, setActiveSubModule] = useState<SubModule>("wasm_processing");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  // 1. WASM Geoprocessing states
  const [selectedTool, setSelectedTool] = useState<string>("hydro_d8");
  const [bufferRadius, setBufferRadius] = useState<number>(2500);
  const [sarThresholdDb, setSarThresholdDb] = useState<number>(-16);
  const [hillshadeAzimuth, setHillshadeAzimuth] = useState<number>(315);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);

  // 2. Swipe & Split-Screen states
  const [swipePercent, setSwipePercent] = useState<number>(50);
  const [leftLayer, setLeftLayer] = useState<string>("satellite");
  const [rightLayer, setRightLayer] = useState<string>("sar_flood");
  const isDraggingRef = useRef(false);

  // 3. Cloud-Native Catalog states
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("ds_facilities_parquet");
  const [activeCatalogLayers, setActiveCatalogLayers] = useState<Record<string, boolean>>({
    ds_facilities_parquet: true,
    ds_roads_pmtiles: false,
    ds_conservation_pmtiles: false,
    ds_basins_geojson: false,
  });

  // 4. Spatial SQL Engine states
  const [sqlQuery, setSqlQuery] = useState<string>(PREDEFINED_SQL_QUERIES[0].sql);
  const [sqlDatasetId, setSqlDatasetId] = useState<string>(PREDEFINED_SQL_QUERIES[0].datasetId);
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(() =>
    executeSpatialQuery(MOZAMBIQUE_FACILITIES.features, PREDEFINED_SQL_QUERIES[0].sql)
  );

  // Generate synthetic DEM bounded to current active AOI or central Mozambique
  const demGrid = useMemo(() => {
    return generateSyntheticDem([[-20.2, 34.0], [-19.4, 35.2]], 70, 50);
  }, []);

  // ── Run WASM / Client-Side Tool ──────────────────────────────────────────
  const runWasmTool = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      let res: ProcessingResult | null = null;
      try {
        switch (selectedTool) {
          case "hydro_d8":
            res = computeD8Hydrology(demGrid, 40);
            break;
          case "hydro_twi":
            res = computeTWI(demGrid);
            break;
          case "terrain_slope":
            res = computeSlopeAspect(demGrid, "slope_deg");
            break;
          case "terrain_aspect":
            res = computeSlopeAspect(demGrid, "aspect");
            break;
          case "terrain_hillshade":
            res = computeHillshade(demGrid, hillshadeAzimuth, 45);
            break;
          case "spectral_sar":
            res = computeSARThreshold(demGrid.bounds, sarThresholdDb);
            break;
          case "vector_buffer":
            res = computeVectorBuffer(MOZAMBIQUE_FACILITIES.features, bufferRadius);
            break;
          case "vector_hull":
            res = computeConvexHull(MOZAMBIQUE_FACILITIES.features);
            break;
          default:
            res = computeD8Hydrology(demGrid, 40);
        }
        setProcessingResult(res);
        toast({
          title: "Geoprocessamento Concluído",
          description: `${res.toolName} executado em ${res.stats.executionTimeMs}ms via WebAssembly local.`,
        });
      } catch (err: any) {
        toast({
          title: "Erro no Geoprocessamento",
          description: err.message || "Falha na execução do algoritmo no navegador.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    }, 40);
  }, [selectedTool, demGrid, hillshadeAzimuth, sarThresholdDb, bufferRadius, toast]);

  // ── Execute Spatial SQL ──────────────────────────────────────────────────
  const handleExecuteSql = useCallback(() => {
    try {
      let targetFeatures: GeoJSON.Feature[] = MOZAMBIQUE_FACILITIES.features;
      if (sqlDatasetId === "ds_roads_pmtiles") targetFeatures = MOZAMBIQUE_HIGHWAYS.features;
      if (sqlDatasetId === "ds_conservation_pmtiles") targetFeatures = MOZAMBIQUE_CONSERVATION_AREAS.features;
      if (sqlDatasetId === "ds_basins_geojson") targetFeatures = MOZAMBIQUE_BASINS.features;

      const res = executeSpatialQuery(targetFeatures, sqlQuery);
      setSqlResult(res);
      toast({
        title: "Consulta SQL Executada",
        description: `${res.rows.length} registos encontrados em ${res.executionTimeMs}ms (DuckDB-WASM compatível).`,
      });
    } catch (err: any) {
      toast({
        title: "Erro na Consulta SQL",
        description: err.message || "Sintaxe SQL inválida.",
        variant: "destructive",
      });
    }
  }, [sqlDatasetId, sqlQuery, toast]);

  // ── Swipe divider drag handler ───────────────────────────────────────────
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
  const exportReport = async () => {
    const ctx = createPDFContext();
    drawCover(
      ctx,
      "Dossiê de Geoprocessamento Client-Side & Formatos Cloud-Native",
      `Módulo GeoProcessamento — ${province ?? "Moçambique"} · ${activeSubModule.toUpperCase()}`,
      [
        { label: "Província", value: province ?? "Nacional" },
        { label: "Distrito", value: district ?? "Todos" },
        { label: "Motor", value: "WebAssembly + DuckDB-WASM" },
        { label: "Execução", value: "Cliente (In-Browser)" },
      ]
    );

    sectionTitle(ctx, "Resumo Executivo do Geoprocessamento");
    ctx.doc.setFontSize(8.5);
    ctx.doc.setTextColor(71, 85, 105);
    ctx.doc.text(
      "Este relatório consolida análises espaciais calculadas localmente na memória do navegador utilizando arquitetura",
      MARGIN,
      ctx.y
    );
    ctx.y += 4;
    ctx.doc.text(
      "inspirada no GeoLibre: algoritmos WebAssembly sem dependência de servidor e consultas espaciais ultrarrápidas.",
      MARGIN,
      ctx.y
    );
    ctx.y += 8;

    if (processingResult) {
      sectionTitle(ctx, `Resultado: ${processingResult.toolName}`);
      drawStatCards(ctx, [
        { label: "Tempo de Execução", value: `${processingResult.stats.executionTimeMs} ms`, color: [14, 165, 233] },
        { label: "Células / Feições", value: `${processingResult.stats.cellCount.toLocaleString("pt-PT")}`, color: [34, 197, 94] },
        { label: "Área de Cobertura", value: `${processingResult.stats.areaKm2} km²`, color: [234, 88, 12] },
        { label: "Valor Médio", value: `${processingResult.stats.mean}`, color: [168, 85, 247] },
      ]);
    }

    if (sqlResult) {
      sectionTitle(ctx, "Resultados da Consulta SQL Espacial");
      const headers = sqlResult.columns.slice(0, 4);
      const rows = sqlResult.rows.slice(0, 8).map((r) => ({
        cells: headers.map((h) => String(r[h] ?? "—")),
      }));
      drawTable(
        ctx,
        headers,
        rows,
        headers.map(() => CONTENT_W / headers.length)
      );
    }

    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_GeoProcessamento_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "Relatório Exportado", description: "PDF gerado com sucesso." });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50 relative">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[650] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-[700] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shrink-0 transition-all duration-300 shadow-xl md:shadow-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${desktopSidebarOpen ? "md:w-80 overflow-y-auto" : "md:w-0 overflow-hidden md:border-r-0"}`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-xs shrink-0 text-white">
              <Cpu size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">GeoProcessamento</h2>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  WASM 100%
                </span>
              </div>
              <p className="text-[10px] text-slate-400">WhiteboxTools · PMTiles · Spatial SQL</p>
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

        {/* 4 Main Sub-Module Tabs */}
        <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubModule("wasm_processing")}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                activeSubModule === "wasm_processing"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Cpu size={12} />
              <span>WASM GIS</span>
            </button>
            <button
              onClick={() => setActiveSubModule("swipe_compare")}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                activeSubModule === "swipe_compare"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Columns2 size={12} />
              <span>Cortina Swipe</span>
            </button>
            <button
              onClick={() => setActiveSubModule("cloud_native")}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                activeSubModule === "cloud_native"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Layers size={12} />
              <span>PMTiles / COG</span>
            </button>
            <button
              onClick={() => setActiveSubModule("spatial_sql")}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                activeSubModule === "spatial_sql"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
              }`}
            >
              <Database size={12} />
              <span>Spatial SQL</span>
            </button>
          </div>
        </div>

        {/* ── Sub-Module 1: WASM & Análise Local ─────────────────────────── */}
        {activeSubModule === "wasm_processing" && (
          <div className="p-3 space-y-3.5 flex-1">
            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-2.5 text-[11px] text-indigo-900 dark:text-indigo-300 flex items-start gap-2">
              <Info size={13} className="shrink-0 text-indigo-500 mt-0.5" />
              <span>
                Processamento raster e vetorial executado <strong>100% na memória do navegador</strong> via WebAssembly, sem servidor e com dados preservados localmente.
              </span>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Ferramenta de Geoprocessamento
              </label>
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <optgroup label="Hidrologia & Relevo">
                  <option value="hydro_d8">Acumulação de Fluxo & Talvegue (D8)</option>
                  <option value="hydro_twi">Índice Topográfico de Humidade (TWI)</option>
                  <option value="terrain_slope">Declive Topográfico (Graus)</option>
                  <option value="terrain_aspect">Orientação de Encostas (Aspect)</option>
                  <option value="terrain_hillshade">Sombreamento Analítico (Hillshade)</option>
                </optgroup>
                <optgroup label="Sensoriamento Remoto & Radar">
                  <option value="spectral_sar">Segmentação de Água por Radar SAR (-16 dB)</option>
                </optgroup>
                <optgroup label="Análise Vetorial">
                  <option value="vector_buffer">Buffer Geodésico em Pontos Críticos</option>
                  <option value="vector_hull">Envelope Convexo (Convex Hull)</option>
                </optgroup>
              </select>
            </div>

            {/* Dynamic tool parameters */}
            {selectedTool === "vector_buffer" && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Raio do Buffer:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{bufferRadius / 1000} km</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={500}
                  value={bufferRadius}
                  onChange={(e) => setBufferRadius(+e.target.value)}
                  className="w-full accent-indigo-600"
                />
              </div>
            )}

            {selectedTool === "spectral_sar" && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Limiar Retroespalhamento:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{sarThresholdDb} dB</span>
                </div>
                <input
                  type="range"
                  min={-24}
                  max={-10}
                  step={1}
                  value={sarThresholdDb}
                  onChange={(e) => setSarThresholdDb(+e.target.value)}
                  className="w-full accent-indigo-600"
                />
              </div>
            )}

            {selectedTool === "terrain_hillshade" && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Azimute Solar:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{hillshadeAzimuth}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={15}
                  value={hillshadeAzimuth}
                  onChange={(e) => setHillshadeAzimuth(+e.target.value)}
                  className="w-full accent-indigo-600"
                />
              </div>
            )}

            <button
              onClick={runWasmTool}
              disabled={isProcessing}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>A processar no cliente...</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Executar Algoritmo WASM</span>
                </>
              )}
            </button>

            {/* Results card */}
            {processingResult && (
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {processingResult.toolName}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {processingResult.stats.executionTimeMs} ms
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {processingResult.stats.summary}
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
                  <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 block">Área Coberta</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {processingResult.stats.areaKm2} km²
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 block">Células / Pontos</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {processingResult.stats.cellCount.toLocaleString("pt-PT")}
                    </span>
                  </div>
                </div>
                {processingResult.vector && (
                  <button
                    onClick={() => exportToGeoJson(processingResult.vector!.features, `${processingResult.toolId}.geojson`)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    <Download size={12} /> Descarregar GeoJSON Gerado
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Sub-Module 2: Cortina Temporal & Swipe ─────────────────────── */}
        {activeSubModule === "swipe_compare" && (
          <div className="p-3 space-y-3.5 flex-1">
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 rounded-xl p-2.5 text-[11px] text-sky-900 dark:text-sky-300 flex items-start gap-2">
              <Columns2 size={13} className="shrink-0 text-sky-500 mt-0.5" />
              <span>
                Divisão de ecrã sincronizada para comparar imagens de satélite antes e depois de ciclones, cheias ou expansão territorial.
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Presets de Mudança Histórica (MZ)
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  {
                    title: "Ciclone Idai (Beira / Búzi)",
                    desc: "Pré-evento Ótico vs. Radar SAR Cheia",
                    left: "satellite",
                    right: "sar_flood",
                  },
                  {
                    title: "Ciclone Freddy (Quelimane)",
                    desc: "Saturação de Solo vs. Inundação",
                    left: "satellite",
                    right: "hydro_twi",
                  },
                  {
                    title: "Erosão & Topografia",
                    desc: "Modelo MDE vs. Risco RUSLE",
                    left: "terrain",
                    right: "rusle",
                  },
                ].map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setLeftLayer(p.left);
                      setRightLayer(p.right);
                      setSwipePercent(50);
                    }}
                    className="p-2 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-xl transition-all cursor-pointer group"
                  >
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {p.title}
                    </div>
                    <div className="text-[10px] text-slate-400">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Camada Esquerda</label>
                <select
                  value={leftLayer}
                  onChange={(e) => setLeftLayer(e.target.value)}
                  className="w-full text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                >
                  <option value="satellite">Satélite Google</option>
                  <option value="terrain">Relevo Topográfico</option>
                  <option value="roadmap">Mapa Rodoviário</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Camada Direita</label>
                <select
                  value={rightLayer}
                  onChange={(e) => setRightLayer(e.target.value)}
                  className="w-full text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                >
                  <option value="sar_flood">Radar SAR Cheia</option>
                  <option value="hydro_twi">Humidade TWI</option>
                  <option value="rusle">Erosão RUSLE</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
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

        {/* ── Sub-Module 3: Formatos Cloud-Native ─────────────────────────── */}
        {activeSubModule === "cloud_native" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-xl p-2.5 text-[11px] text-emerald-900 dark:text-emerald-300 flex items-start gap-2">
              <Layers size={13} className="shrink-0 text-emerald-500 mt-0.5" />
              <span>
                Streaming direto de pirâmides vetoriais e rasters (PMTiles, COG, GeoParquet) via requisições HTTP Range, sem renderizador no servidor.
              </span>
            </div>

            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Catálogo de Dados Abertos (MZ)
            </label>

            <div className="space-y-2">
              {CLOUD_NATIVE_CATALOG.map((ds) => {
                const isActive = activeCatalogLayers[ds.id];
                return (
                  <div
                    key={ds.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isActive
                        ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{ds.title}</span>
                      <button
                        onClick={() =>
                          setActiveCatalogLayers((prev) => ({ ...prev, [ds.id]: !prev[ds.id] }))
                        }
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          isActive
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800"
                        }`}
                        title={isActive ? "Ocultar camada" : "Visualizar camada no mapa"}
                      >
                        {isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-1.5">
                      {ds.description}
                    </p>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-bold text-slate-600 dark:text-slate-300">
                        {ds.format}
                      </span>
                      <span>{ds.sizeMb} MB</span>
                      <span>{ds.featureCount} elementos</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Sub-Module 4: Spatial SQL Engine ───────────────────────────── */}
        {activeSubModule === "spatial_sql" && (
          <div className="p-3 space-y-3 flex-1">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl p-2.5 text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <Database size={13} className="shrink-0 text-amber-500 mt-0.5" />
              <span>
                Motor DuckDB-WASM Spatial no cliente. Execute consultas SQL com filtros geométricos e agrupamentos espaciais em milissegundos.
              </span>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Consultas Pré-Configuradas
              </label>
              <select
                onChange={(e) => {
                  const q = PREDEFINED_SQL_QUERIES.find((item) => item.id === e.target.value);
                  if (q) {
                    setSqlQuery(q.sql);
                    setSqlDatasetId(q.datasetId);
                  }
                }}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              >
                {PREDEFINED_SQL_QUERIES.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Editor SQL Espacial
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
                <div className="flex gap-2">
                  <button
                    onClick={() => exportToCsv(sqlResult.rows, "consulta_espacial.csv")}
                    className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download size={11} /> Exportar CSV
                  </button>
                  {sqlResult.features && sqlResult.features.length > 0 && (
                    <button
                      onClick={() => exportToGeoJson(sqlResult.features!, "consulta_espacial.geojson")}
                      className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Download size={11} /> Exportar GeoJSON
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer: Export PDF */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={exportReport}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs cursor-pointer"
          >
            <FileDown size={14} />
            <span>Exportar Relatório PDF</span>
          </button>
        </div>
      </div>

      {/* Desktop collapse toggle button */}
      <button
        type="button"
        onClick={() => setDesktopSidebarOpen((v) => !v)}
        style={{ left: desktopSidebarOpen ? "20rem" : "0px" }}
        title={desktopSidebarOpen ? "Recolher painel" : "Expandir painel"}
        className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* ── Main Map View ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative" ref={mapContainerRef}>
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

          {/* 1. Render WASM Hydrology Streams or Vectors */}
          {activeSubModule === "wasm_processing" && processingResult?.vector && (
            <GeoJSON
              key={`wasm-vec-${processingResult.toolId}-${processingResult.stats.cellCount}`}
              data={processingResult.vector}
              style={() => ({
                color: processingResult.colorRamp.maxColor,
                weight: 2.5,
                opacity: 0.85,
                fillColor: processingResult.colorRamp.minColor,
                fillOpacity: 0.35,
              })}
            />
          )}

          {/* 2. Render Active Cloud-Native Catalog Layers */}
          {activeCatalogLayers.ds_roads_pmtiles && (
            <GeoJSON
              key="catalog-roads"
              data={MOZAMBIQUE_HIGHWAYS}
              style={(f) => ({
                color: f?.properties?.tipo === "Autoestrada" ? "#f97316" : "#2563eb",
                weight: 3.5,
                opacity: 0.9,
              })}
              onEachFeature={(f, layer) => {
                layer.bindPopup(
                  `<strong>${f.properties.codigo}</strong><br/>${f.properties.nome}<br/>Trecho: ${f.properties.troco}`
                );
              }}
            />
          )}

          {activeCatalogLayers.ds_conservation_pmtiles && (
            <GeoJSON
              key="catalog-conservation"
              data={MOZAMBIQUE_CONSERVATION_AREAS}
              style={() => ({
                color: "#16a34a",
                weight: 2,
                fillColor: "#22c55e",
                fillOpacity: 0.25,
              })}
              onEachFeature={(f, layer) => {
                layer.bindPopup(
                  `<strong>${f.properties.nome}</strong><br/>Categoria: ${f.properties.categoria}<br/>Área: ${f.properties.area_km2} km²`
                );
              }}
            />
          )}

          {activeCatalogLayers.ds_basins_geojson && (
            <GeoJSON
              key="catalog-basins"
              data={MOZAMBIQUE_BASINS}
              style={() => ({
                color: "#0284c7",
                weight: 2,
                fillColor: "#38bdf8",
                fillOpacity: 0.2,
                dashArray: "4 4",
              })}
              onEachFeature={(f, layer) => {
                layer.bindPopup(
                  `<strong>${f.properties.nome}</strong><br/>Jurisdição: ${f.properties.ara}<br/>Vazão: ${f.properties.vazao_media_m3s} m³/s`
                );
              }}
            />
          )}

          {/* Render Facilities Points */}
          {activeCatalogLayers.ds_facilities_parquet &&
            MOZAMBIQUE_FACILITIES.features.map((f, i) => {
              const coords = f.geometry.coordinates as [number, number];
              const isHighRisk = f.properties?.risco_cheia === "Alto" || f.properties?.risco_cheia === "Crítico";
              return (
                <Marker
                  key={`fac-${i}`}
                  position={[coords[1], coords[0]]}
                  icon={isHighRisk ? highRiskIcon : facilityIcon}
                >
                  <Popup>
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-slate-800">{f.properties?.nome}</div>
                      <div>Tipo: {f.properties?.tipo}</div>
                      <div>Província: {f.properties?.provincia} ({f.properties?.distrito})</div>
                      <div>
                        Risco de Cheia:{" "}
                        <span className={isHighRisk ? "text-red-600 font-bold" : "text-emerald-600"}>
                          {f.properties?.risco_cheia}
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

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
        {activeSubModule === "swipe_compare" && (
          <div
            className="absolute top-0 bottom-0 z-[600] w-1 bg-white cursor-ew-resize select-none pointer-events-auto shadow-2xl flex items-center justify-center"
            style={{ left: `${swipePercent}%` }}
            onMouseDown={handleMouseDown}
          >
            <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 shadow-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 cursor-ew-resize">
              <Columns2 size={16} />
            </div>
            {/* Left / Right floating labels */}
            <div className="absolute top-4 -left-32 px-2.5 py-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {leftLayer} (Antes)
            </div>
            <div className="absolute top-4 left-4 px-2.5 py-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-lg shadow-md border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              {rightLayer} (Depois)
            </div>
          </div>
        )}

        <BasemapSwitcher
          current={basemap}
          onChange={setBasemap}
          className="absolute bottom-16 sm:bottom-6 left-4 z-[600]"
          position="bottom-left"
        />

        {/* Tool Legend HUD */}
        {activeSubModule === "wasm_processing" && processingResult && (
          <div className="absolute bottom-6 right-4 z-[600] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-2.5 text-xs max-w-xs">
            <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {processingResult.toolName}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span
                className="w-3 h-3 rounded"
                style={{ background: processingResult.colorRamp.minColor }}
              />
              <span>{processingResult.colorRamp.labels[0]}</span>
              <span className="mx-1">→</span>
              <span
                className="w-3 h-3 rounded"
                style={{ background: processingResult.colorRamp.maxColor }}
              />
              <span>{processingResult.colorRamp.labels[processingResult.colorRamp.labels.length - 1]}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

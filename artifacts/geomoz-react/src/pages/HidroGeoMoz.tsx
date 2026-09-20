/**
 * HidroGeoMoz — Módulo de Análise de Bacias Hidrográficas
 *
 * Modo "Explorar Bacias": HydroBASINS clicáveis + stats GEE (painel direito).
 * Modo "Delimitar Bacia": clique no mapa → watershed D8 via DEM HydroSHEDS (painel direito).
 * Rede de Linhas de Água: multi-ordem (aprox. Strahler 1–5).
 * Sidebar esquerda recolhível.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MapContainer, TileLayer, GeoJSON, ScaleControl, ZoomControl,
  CircleMarker, useMapEvents,
} from "react-leaflet";
import type { Map as LMap, Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Droplets, Loader2, Play, ChevronDown, Download, RefreshCw,
  AlertTriangle, CheckCircle2, Info, Activity, Layers,
  TrendingUp, Wind, Waves, Zap, FileText, BarChart2,
  Globe, MapPin, Crosshair, GitBranch, ChevronLeft, ChevronRight,
  Mountain, Ruler, Gauge, ArrowDownCircle, FileDown, PenTool,
  Share2, Copy, Check, ExternalLink, Compass, X, ShieldCheck,
  BookmarkCheck, Bookmark, FolderOpen, Save, FileCode, Trash2,
} from "lucide-react";
import { downloadStandaloneBasinHtml } from "@/lib/standalone-html-export";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useStats } from "@/hooks/useGeoMoz";
import { apiUrl, apiFetch } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import ZoneSelect from "@/components/ZoneSelect";
import MapDraw from "@/components/MapDraw";
import type { AreaOfInterest } from "@/lib/aoi";
import { aoiToAPI, customAOI, GLOBAL_AOI } from "@/lib/aoi";
import {
  renderBasinMapToDataUrl,
  fetchMapImage,
  captureMapImage,
  addPDFFooter,
  drawCoordinateGrid,
  drawNorthArrow,
  drawGraphicScaleBar,
  MARGIN,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from "@/lib/pdf-export";
import jsPDF from "jspdf";

// ── Types ────────────────────────────────────────────────────────────────────

interface BasinsResult {
  tileUrl:  string | null;
  geojson:  GeoJSON.FeatureCollection | null;
  count:    number;
  level:    number;
  source:   "hydrobasins" | "unavailable";
  error?:   string;
}

interface BasinStats {
  areaKm2:        number;
  perimeterKm:    number;
  elevMinM:       number;
  elevMeanM:      number;
  elevMaxM:       number;
  slopeMeanDeg:   number;
  ndviMean:       number | null;
  ndwiMean:       number | null;
  precipMmYr:     number;
  erosionRisk:    number;
  floodRisk:      number;
  hydroPotential: number;
}

interface DrainageResult   { tileUrl: string; threshold: number }
interface RiverNetResult   { tileUrl: string; majorTileUrl: string; orders: Record<string, number>; palette: string[] }
interface WatershedResult  { tileUrl: string; geojson: GeoJSON.FeatureCollection; pourPoint: [number, number]; areaKm2: number; maxIter?: number; level?: number; source?: string }
interface LandCoverClass   { code: number; label: string; color: string; areaKm2: number; pct: number }
interface BasinReport {
  morphometry: {
    areaKm2: number; perimeterKm: number; elevMinM: number; elevMeanM: number; elevMaxM: number;
    reliefM: number; slopeMeanDeg: number; slopeMaxDeg: number;
    drainageDensity: number; compactness: number; formFactor: number;
  };
  landcover: LandCoverClass[];
  landcoverTile: string;
  precipMonthly: number[];
  precipAnnualMm: number;
  runoff: { cnMean: number | null; cnTile: string; note: string };
}

type Mode = "explore" | "delineate";
type DelineateMethod = "point" | "polygon";

function getGeometryCenter(geom: any): [number, number] {
  try {
    let coords: number[][] = [];
    if (geom.type === "Polygon") {
      coords = geom.coordinates[0];
    } else if (geom.type === "MultiPolygon") {
      coords = geom.coordinates[0][0];
    }
    if (coords && coords.length > 0) {
      const lats = coords.map((c: number[]) => c[1]);
      const lngs = coords.map((c: number[]) => c[0]);
      return [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      ];
    }
  } catch {}
  return [-18.665695, 35.529562];
}

function computeGeoJsonBounds(geojson: any): { south: number; north: number; west: number; east: number } {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  function traverse(coords: any) {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lng = coords[0], lat = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    } else if (Array.isArray(coords)) {
      coords.forEach(traverse);
    }
  }
  if (geojson?.features) {
    geojson.features.forEach((f: any) => traverse(f.geometry?.coordinates));
  } else if (geojson?.coordinates) {
    traverse(geojson.coordinates);
  }
  if (minLat >= maxLat || minLng >= maxLng) {
    return { south: -26.9, north: -10.4, west: 30.2, east: 41.0 };
  }
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.05);
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.05);
  return {
    south: Math.max(-90, minLat - padLat),
    north: Math.min(90, maxLat + padLat),
    west: Math.max(-180, minLng - padLng),
    east: Math.min(180, maxLng + padLng),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(v: number) {
  if (v < 30) return "#22c55e";
  if (v < 55) return "#f59e0b";
  if (v < 75) return "#f97316";
  return "#ef4444";
}
function riskLabel(v: number) {
  if (v < 30) return "Baixo";
  if (v < 55) return "Moderado";
  if (v < 75) return "Alto";
  return "Muito alto";
}

function RiskBar({ label, value, icon: Icon, invert = false }: {
  label: string; value: number; icon: React.ElementType; invert?: boolean;
}) {
  const eff   = invert ? 100 - value : value;
  const color = riskColor(eff);
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between mb-0.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-[11px] font-bold" style={{ color }}>{riskLabel(eff)} · {value.toFixed(0)}</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, unit = "" }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 font-mono">
        {value}<span className="text-slate-400 font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={11} className="text-blue-500" />
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
    </div>
  );
}

// ── Map click handler ─────────────────────────────────────────────────────────

function MapClickHandler({ onMapClick, active }: { onMapClick: (lat: number, lng: number) => void; active: boolean }) {
  useMapEvents({ click(e) { if (active) onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  aoi: AreaOfInterest;
  province: string | null; district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
  onAOIChange: (aoi: AreaOfInterest) => void;
  viewMode?: "2d" | "3d";
  onViewModeChange?: (mode: "2d" | "3d") => void;
}

export default function HidroGeoMoz({
  aoi, province, district, onProvinceChange, onDistrictChange, onAOIChange,
  viewMode: propViewMode, onViewModeChange,
}: Props) {
  const { toast } = useToast();
  const mapRef = useRef<LMap | null>(null);

  const [internalViewMode, setInternalViewMode] = useState<"2d" | "3d">("3d");
  const viewMode = propViewMode ?? internalViewMode;
  const handleViewModeChange = onViewModeChange ?? setInternalViewMode;

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [basemap, setBasemap] = useState<BasemapType>("terrain");

  // Mode — "delineate" (D8/DEM) is the robust primary method; HydroBASINS may be
  // unavailable in the active Earth Engine project, so we default to delineation.
  const [mode, setMode] = useState<Mode>("delineate");

  // Explore
  const [basinsData,    setBasinsData]    = useState<BasinsResult | null>(null);
  const [drainageTile,  setDrainageTile]  = useState<DrainageResult | null>(null);
  const [selectedFeat,  setSelectedFeat]  = useState<GeoJSON.Feature | null>(null);
  const [basinStats,    setBasinStats]    = useState<BasinStats | null>(null);
  const [basinLevel,    setBasinLevel]    = useState(6);
  const [drainThresh,   setDrainThresh]   = useState(500);
  const [showDrainage,  setShowDrainage]  = useState(true);

  // Delineate
  const [delineateMethod, setDelineateMethod] = useState<DelineateMethod>("point");
  const [pourPoint,     setPourPoint]     = useState<[number, number] | null>(null);
  const [watershedData, setWatershedData] = useState<WatershedResult | null>(null);
  const [maxIter]                         = useState(60);   // D8 fallback only
  const [level,         setLevel]         = useState(10);
  const [loadingWS,     setLoadingWS]     = useState(false);
  const [wsStats,       setWsStats]       = useState<BasinStats | null>(null);
  const [loadingWsSt,   setLoadingWsSt]   = useState(false);
  const [watershedDrainageTile, setWatershedDrainageTile] = useState<string | null>(null);
  const [loadingWatershedDrainage, setLoadingWatershedDrainage] = useState(false);
  const [showWatershedDrainage, setShowWatershedDrainage] = useState(true);
  const [watershedDrainThresh, setWatershedDrainThresh] = useState(250);

  // Full hydro-environmental basin report
  const [basinReport,   setBasinReport]   = useState<BasinReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportLayer,   setReportLayer]   = useState<"none" | "lulc" | "cn">("none");

  // River network
  const [riverNet,      setRiverNet]      = useState<RiverNetResult | null>(null);
  const [showRiverNet,  setShowRiverNet]  = useState(false);
  const [loadingRN,     setLoadingRN]     = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);

  // Shared
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [geeStatus,     setGeeStatus]     = useState<{ connected: boolean } | null>(null);
  const [loadingBasins, setLoadingBasins] = useState(false);
  const [loadingStats,  setLoadingStats]  = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  // Saved analyses state (Zero GEE Permanent Archive)
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<any[]>(() => {
    try {
      const local = localStorage.getItem("geomoz_saved_analyses");
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Sync saved analyses from server on mount
  useEffect(() => {
    apiFetch("/geomoz-api/analyses")
      .then((r) => r.json())
      .then((serverItems) => {
        if (Array.isArray(serverItems)) {
          setSavedAnalyses((prev) => {
            const merged = [...prev];
            serverItems.forEach((s) => {
              if (!merged.some((m) => m.id === s.id)) {
                merged.push(s);
              }
            });
            try {
              localStorage.setItem("geomoz_saved_analyses", JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  async function handleSaveAnalysis() {
    if (!watershedData && !basinReport) {
      toast({
        variant: "destructive",
        title: "Nenhuma bacia ativa",
        description: "Delimite ou analise uma bacia antes de guardar.",
      });
      return;
    }
    const area = basinReport?.morphometry?.areaKm2 || watershedData?.areaKm2 || 0;
    const defaultTitle = `Bacia Hidrográfica — ${province ?? "Moçambique"}${district ? ` / ${district}` : ""} (${area.toLocaleString("pt-PT")} km²)`;
    const title = window.prompt("Nome para guardar esta análise no arquivo permanente:", defaultTitle);
    if (title === null) return;
    const chosenTitle = title.trim() || defaultTitle;

    const id = "basin_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6);
    const item = {
      id,
      title: chosenTitle,
      saved_at: Date.now(),
      data: {
        basinReport,
        wsStats,
        watershedData,
        watershedDrainageTile,
        pourPoint,
        province,
        district,
        aoi,
      },
      metadata: {
        areaKm2: area,
        date: new Date().toISOString(),
        province,
        district,
      },
    };

    const updated = [item, ...savedAnalyses.filter((a) => a.id !== id)];
    setSavedAnalyses(updated);
    try {
      localStorage.setItem("geomoz_saved_analyses", JSON.stringify(updated));
    } catch {}

    try {
      await apiFetch("/geomoz-api/analyses/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: chosenTitle,
          type: "hidro",
          data: item.data,
          metadata: item.metadata,
        }),
      });
    } catch {}

    toast({
      title: "Análise guardada com sucesso!",
      description: "Esta bacia ficou arquivada de forma permanente. Poderá reabri-la instantaneamente sem recorrer ao GEE.",
    });
  }

  async function handleLoadSavedAnalysis(item: any) {
    let fullData = item.data;
    if (!fullData) {
      setLoadingSaved(true);
      try {
        const res = await apiFetch(`/geomoz-api/analyses/${item.id}`);
        if (res.ok) {
          const json = await res.json();
          fullData = json.data;
        }
      } catch {}
      setLoadingSaved(false);
    }
    if (!fullData) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar",
        description: "Não foi possível carregar os dados desta análise.",
      });
      return;
    }

    setMode("delineate");
    setWatershedData(fullData.watershedData || null);
    setBasinReport(fullData.basinReport || null);
    setWsStats(fullData.wsStats || null);
    setPourPoint(fullData.pourPoint || null);
    if (fullData.watershedDrainageTile) {
      setWatershedDrainageTile(fullData.watershedDrainageTile);
    }
    if (fullData.province) setProvince(fullData.province);
    if (fullData.district) setDistrict(fullData.district);
    setSavedModalOpen(false);

    if (mapRef.current && fullData.watershedData?.geojson) {
      try {
        const b = computeGeoJsonBounds(fullData.watershedData.geojson);
        mapRef.current.fitBounds([
          [b.south, b.west],
          [b.north, b.east],
        ]);
      } catch {}
    }

    toast({
      title: "Análise carregada do arquivo!",
      description: `«${item.title}» restaurada com sucesso. Zero chamadas ao GEE.`,
    });
  }

  async function handleDeleteSavedAnalysis(id: string) {
    const updated = savedAnalyses.filter((a) => a.id !== id);
    setSavedAnalyses(updated);
    try {
      localStorage.setItem("geomoz_saved_analyses", JSON.stringify(updated));
    } catch {}
    try {
      await apiFetch(`/geomoz-api/analyses/${id}`, { method: "DELETE" });
    } catch {}
    toast({ title: "Análise eliminada do arquivo" });
  }

  function handleExportStandaloneHtml() {
    if (!watershedData && !basinReport) {
      toast({
        variant: "destructive",
        title: "Nenhuma bacia ativa",
        description: "Delimite uma bacia antes de exportar o HTML.",
      });
      return;
    }
    const area = basinReport?.morphometry?.areaKm2 || watershedData?.areaKm2 || 0;
    downloadStandaloneBasinHtml({
      title: `Bacia Hidrográfica — ${province ?? "Moçambique"}${district ? ` / ${district}` : ""} (${area.toLocaleString("pt-PT")} km²)`,
      basinReport,
      watershedData,
      wsStats,
      pourPoint,
      province,
      district,
    });
    toast({
      title: "WebGIS HTML descarregado!",
      description: "Ficheiro HTML autónomo gerado. Pode ser aberto em qualquer computador offline sem precisar de servidor.",
    });
  }

  // WebGIS Share state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  // PDF Export modal state
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [pdfExportType, setPdfExportType] = useState<"both" | "lulc" | "cn">("both");
  const [exportingPdf, setExportingPdf] = useState(false);

  async function handleShareWebGis() {
    if (!basinReport && !watershedData) {
      toast({
        variant: "destructive",
        title: "Nenhuma bacia ativa",
        description: "Delimite uma bacia ou gere o relatório antes de partilhar.",
      });
      return;
    }
    setShareLoading(true);
    setShareModalOpen(true);
    try {
      const payload = {
        type: "hidro",
        title: `Bacia Hidrográfica — ${province ?? "Moçambique"}${district ? ` / ${district}` : ""}`,
        data: {
          basinReport,
          wsStats,
          watershedData,
          watershedDrainageTile,
          pourPoint,
          province,
          district,
          aoi,
        },
        metadata: {
          areaKm2: basinReport?.morphometry?.areaKm2 || watershedData?.areaKm2 || 0,
          date: new Date().toISOString(),
        },
      };

      try {
        localStorage.setItem("geomoz_last_hidro_share", JSON.stringify(payload.data));
      } catch {}

      const res = await apiFetch("/geomoz-api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = await res.json();
      const fullUrl = `${window.location.origin}/view/hidro?id=${json.shareId}`;
      setShareUrl(fullUrl);
      try {
        localStorage.setItem(`geomoz_share_${json.shareId}`, JSON.stringify(payload.data));
      } catch {}
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao gerar link de partilha",
        description: err.message || String(err),
      });
    } finally {
      setShareLoading(false);
    }
  }

  // GeoMoz data
  const { data: statsData       } = useStats(province, district);

  // GEE check
  const checkGEE = useCallback(async () => {
    try {
      const r = await apiFetch("/geomoz-api/gee/status");
      const d = await r.json();
      setGeeStatus(d);
      return d.connected as boolean;
    } catch {
      setGeeStatus({ connected: false });
      toast({
        variant: "destructive",
        title: "Erro de conexão",
        description: "Não foi possível conectar ao Google Earth Engine.",
      });
      return false;
    }
  }, []);

  // Load basins
  async function loadBasins() {
    setError(null); setLoadingBasins(true); setBasinsData(null);
    setSelectedFeat(null); setBasinStats(null);
    const ok = await checkGEE();
    if (!ok) { setLoadingBasins(false); return; }
    try {
      const [bRes, dRes] = await Promise.all([
        apiFetch("/geomoz-api/gee/basins", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...aoiToAPI(aoi), level: basinLevel }) }),
        showDrainage
          ? apiFetch("/geomoz-api/gee/drainage", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...aoiToAPI(aoi), threshold: drainThresh }) })
          : Promise.resolve(null),
      ]);
      if (!bRes.ok) throw new Error((await bRes.json()).detail ?? bRes.statusText);
      const bd: BasinsResult = await bRes.json();
      setBasinsData(bd);
      // HydroBASINS unavailable is an expected condition (see inline note) — don't
      // raise an alarming red error; the persistent amber hint already guides the user.
      if (dRes?.ok) setDrainageTile(await dRes.json());
    } catch (e) {
      const errorMsg = String(e instanceof Error ? e.message : e);
      setError(errorMsg);
      toast({
        variant: "destructive",
        title: "Erro ao carregar bacias",
        description: errorMsg,
      });
    }
    finally { setLoadingBasins(false); }
  }

  // Basin click
  async function onBasinClick(feat: GeoJSON.Feature) {
    setSelectedFeat(feat); setBasinStats(null); setLoadingStats(true);
    try {
      const r = await apiFetch("/geomoz-api/gee/basin-stats", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: feat.geometry }) });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setBasinStats(await r.json());
    } catch (e) {
      const errorMsg = String(e instanceof Error ? e.message : e);
      setError(errorMsg);
      toast({
        variant: "destructive",
        title: "Erro ao carregar estatísticas",
        description: errorMsg,
      });
    }
    finally { setLoadingStats(false); }
  }

  // River network
  async function loadRiverNetwork() {
    setLoadingRN(true); setError(null);
    const ok = await checkGEE();
    if (!ok) { setLoadingRN(false); return; }
    try {
      const r = await apiFetch("/geomoz-api/gee/river-network", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...aoiToAPI(aoi) }) });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setRiverNet(await r.json()); setShowRiverNet(true);
    } catch (e) {
      const errorMsg = String(e instanceof Error ? e.message : e);
      setError(errorMsg);
      toast({
        variant: "destructive",
        title: "Erro ao carregar rede fluvial",
        description: errorMsg,
      });
    }
    finally { setLoadingRN(false); }
  }

  // Watershed drainage network calculation
  const loadWatershedDrainage = useCallback(async (geom: any, thresh = watershedDrainThresh) => {
    if (!geom) return;
    setLoadingWatershedDrainage(true);
    try {
      const r = await apiFetch("/geomoz-api/gee/drainage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: geom, threshold: thresh }),
      });
      if (r.ok) {
        const data = await r.json();
        setWatershedDrainageTile(data.tileUrl);
      }
    } catch (err) {
      console.error("Erro ao gerar linhas de água da bacia:", err);
    } finally {
      setLoadingWatershedDrainage(false);
    }
  }, [watershedDrainThresh]);

  // Watershed delineation by point (Pour Point)
  async function onMapClick(lat: number, lng: number) {
    if (mode !== "delineate" || drawingEnabled || delineateMethod !== "point") return;
    setError(null); setPourPoint([lat, lng]); setWatershedData(null); setWsStats(null);
    setWatershedDrainageTile(null);
    setBasinReport(null); setReportLayer("none"); setLoadingWS(true);
    const ok = await checkGEE();
    if (!ok) { setLoadingWS(false); return; }
    // Hard timeout so the UI never hangs forever on a slow GEE response.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const r = await apiFetch("/geomoz-api/gee/watershed", { method: "POST",
        headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ lat, lon: lng, ...aoiToAPI(aoi), max_iter: maxIter, level }) });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      const wd: WatershedResult = await r.json();
      setWatershedData(wd);
      setLoadingWS(false);   // show the basin immediately; stats load separately
      const basinGeom = wd.geojson?.features?.[0]?.geometry ?? wd.geojson;
      // Auto-fetch drainage network clipped to the delineated basin
      if (basinGeom) {
        loadWatershedDrainage(basinGeom, watershedDrainThresh);
      }
      // Auto-stats for delineated watershed
      if (wd.geojson?.features?.length) {
        setLoadingWsSt(true);
        try {
          const sr = await apiFetch("/geomoz-api/gee/basin-stats", { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geometry: basinGeom }) });
          if (sr.ok) setWsStats(await sr.json());
        } catch { /* silent */ } finally { setLoadingWsSt(false); }
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const errorMsg = aborted
        ? "A delineação demorou demasiado. Tente outro ponto ou um nível de detalhe mais baixo."
        : String(e instanceof Error ? e.message : e);
      setError(errorMsg);
      toast({
        variant: "destructive",
        title: "Erro ao delinear bacia",
        description: errorMsg,
      });
    }
    finally { clearTimeout(timer); setLoadingWS(false); }
  }

  // Delineate by Polygon / AOI (Recorte exato pela área de estudo)
  const delineateByPolygon = useCallback(async (geometry: any, label?: string) => {
    if (!geometry) return;
    setError(null);
    setLoadingWS(true);
    setWatershedData(null);
    setWsStats(null);
    setBasinReport(null);
    setReportLayer("none");
    setWatershedDrainageTile(null);

    const ok = await checkGEE();
    if (!ok) {
      setLoadingWS(false);
      return;
    }

    const center = getGeometryCenter(geometry);
    setPourPoint(center);

    const wd: WatershedResult = {
      tileUrl: "",
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: geometry,
          properties: {
            name: label || aoi.label || "Área de Estudo Delimitada",
            source: "polygon",
          },
        }],
      },
      pourPoint: center,
      areaKm2: 0,
      source: "polygon",
    };
    setWatershedData(wd);
    setLoadingWS(false);

    // 1. Auto-fetch drainage network clipped to this polygon (HydroSHEDS + FreeFlowingRivers)
    loadWatershedDrainage(geometry, watershedDrainThresh);

    // 2. Fetch sub-basins that intersect this polygon
    try {
      apiFetch("/geomoz-api/gee/basins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry, level: basinLevel }),
      }).then(async (r) => {
        if (r.ok) {
          const bd = await r.json();
          setBasinsData(bd);
        }
      }).catch(() => {});
    } catch {}

    // 3. Auto-stats for polygon
    setLoadingWsSt(true);
    try {
      const sr = await apiFetch("/geomoz-api/gee/basin-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry }),
      });
      if (sr.ok) {
        const stats: BasinStats = await sr.json();
        setWsStats(stats);
        setWatershedData((prev) => prev ? { ...prev, areaKm2: stats.areaKm2 } : prev);
      }
    } catch (e) {
      console.error("Erro ao calcular estatísticas da área:", e);
    } finally {
      setLoadingWsSt(false);
    }
  }, [aoi.label, basinLevel, checkGEE, loadWatershedDrainage, watershedDrainThresh]);

  // Generate the full hydro-environmental report for the delineated basin
  async function runBasinReport() {
    const geom = watershedData?.geojson?.features?.[0]?.geometry;
    if (!geom) return;
    setLoadingReport(true); setError(null);
    try {
      const r = await apiFetch("/geomoz-api/gee/basin-report", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: geom }) });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setBasinReport(await r.json());
    } catch (e) {
      const errorMsg = String(e instanceof Error ? e.message : e);
      setError(errorMsg);
      toast({ variant: "destructive", title: "Erro ao gerar relatório", description: errorMsg });
    } finally { setLoadingReport(false); }
  }

  // Style
  function basinStyle(feat?: GeoJSON.Feature) {
    const sel = feat?.properties?.HYBAS_ID === selectedFeat?.properties?.HYBAS_ID;
    return { color: sel ? "#f59e0b" : "#1a73e8", weight: sel ? 2.5 : 1,
      fillColor: sel ? "#f59e0b" : "#1a73e8", fillOpacity: sel ? 0.25 : 0.07, opacity: 1 };
  }

  // ── PDF Report ────────────────────────────────────────────────────────────
  // ── PDF Report (Estilo QGIS) ──────────────────────────────────────────────
  async function generateBasinReportPdf(type: "both" | "lulc" | "cn" = pdfExportType) {
    const report = basinReport;
    const wsData = watershedData;
    if (!report || !wsData) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const PP = pourPoint ?? [0, 0];
      const date = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
      let pageNum = 1;

      const totalArea = report.morphometry.areaKm2 || wsData.areaKm2 || 0;

      const newPage_ = (pageTitle: string = "Relatório de Bacia") => {
        addPDFFooter({ doc, pageNum, date, y: 0, title: "" });
        doc.addPage();
        pageNum++;
        doc.setFillColor(15, 23, 42); // Navy 900
        doc.rect(0, 0, W, 10, "F");
        doc.setFillColor(2, 132, 199); // Sky 600
        doc.rect(0, 9, W, 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("GeoMoz Explorer — " + pageTitle, MARGIN, 6.5);
        doc.text(`Área: ${totalArea.toLocaleString("pt-PT")} km²`, W - MARGIN, 6.5, { align: "right" });
        return 18;
      };

      function sectionLabel(label: string, y: number): number {
        doc.setFillColor(248, 250, 252);
        doc.rect(MARGIN, y, CONTENT_W, 7, "F");
        doc.setDrawColor(226, 232, 240);
        doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
        doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
        doc.setFillColor(2, 132, 199);
        doc.rect(MARGIN, y, 3, 7, "F");
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text(label.toUpperCase(), MARGIN + 6, y + 5);
        return y + 11;
      }

      // ── PAGE 1: COVER & RELATÓRIO TÉCNICO ──
      doc.setFillColor(15, 23, 42); // Dark Navy #0f172a
      doc.rect(0, 0, W, 35, "F");
      doc.setFillColor(2, 132, 199); // Sky blue #0284c7
      doc.rect(0, 31, W, 4, "F");

      doc.setFillColor(255, 255, 255);
      doc.circle(MARGIN + 8, 17, 8, "F");
      doc.setFillColor(2, 132, 199);
      doc.circle(MARGIN + 8, 17, 5.5, "F");
      doc.setFillColor(255, 255, 255);
      doc.circle(MARGIN + 8, 17, 2, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("GeoMoz Explorer", MARGIN + 20, 15);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Relatório Hidro-Ambiental de Bacia", MARGIN + 20, 23);

      // Area + date right (Fixed 0 km² bug)
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Área: ${totalArea.toLocaleString("pt-PT")} km²`, W - MARGIN, 14, { align: "right" });
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text(date, W - MARGIN, 22, { align: "right" });

      // Info strip
      doc.setFillColor(240, 249, 255);
      doc.rect(0, 35, W, 10, "F");
      doc.setTextColor(3, 105, 161);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      const infoParts = [
        `Ponto: ${PP[0].toFixed(4)}°, ${PP[1].toFixed(4)}°`,
        `Fonte: ${wsData.source === "hydrobasins" ? `HydroBASINS (nível ${wsData.level ?? "—"})` : wsData.source === "polygon" ? "Delimitação por Polígono / AOI" : "D8 · HydroSHEDS"}`,
        `Datum: WGS 84 (EPSG:4326)`,
      ];
      doc.text(infoParts.join("   ·   "), MARGIN, 42);

      let y = 52;

      // ── MORPHOMETRY CARDS ──
      y = sectionLabel("Morfometria da Bacia", y);
      const m = report.morphometry;
      const cards = [
        { label: "Área", val: `${totalArea.toLocaleString("pt-PT")}`, unit: "km²" },
        { label: "Perímetro", val: `${m.perimeterKm.toFixed(0)}`, unit: "km" },
        { label: "Elev. mín.", val: `${m.elevMinM.toFixed(0)}`, unit: "m" },
        { label: "Elev. média", val: `${m.elevMeanM.toFixed(0)}`, unit: "m" },
        { label: "Elev. máx.", val: `${m.elevMaxM.toFixed(0)}`, unit: "m" },
        { label: "Relevo", val: `${m.reliefM.toFixed(0)}`, unit: "m" },
        { label: "Declive méd.", val: `${m.slopeMeanDeg.toFixed(1)}`, unit: "°" },
        { label: "Declive máx.", val: `${m.slopeMaxDeg.toFixed(1)}`, unit: "°" },
        { label: "Dens. dren.", val: `${m.drainageDensity}`, unit: "km/km²" }, // Fixed km {¹ bug
        { label: "Compacidade", val: `${m.compactness}`, unit: "" },
        { label: "Fator forma", val: `${m.formFactor}`, unit: "" },
      ];
      const cCols = 4;
      const cW = (CONTENT_W - (cCols - 1) * 2.5) / cCols;
      const cH = 14;
      cards.forEach((c, i) => {
        const cx = MARGIN + (i % cCols) * (cW + 2.5);
        const cy = y + Math.floor(i / cCols) * (cH + 2.5);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx, cy, cW, cH, 2, 2, "F");
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(cx, cy, cW, cH, 2, 2, "S");
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(c.label, cx + 4, cy + 5);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(c.val, cx + 4, cy + 12);
        if (c.unit) {
          doc.setTextColor(148, 163, 184);
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "normal");
          doc.text(c.unit, cx + cW - 4, cy + 12, { align: "right" });
        }
      });
      const cardRows = Math.ceil(cards.length / cCols);
      y += cardRows * (cH + 2.5) + 4;

      // ── LAND COVER ──
      y = sectionLabel("Uso e Cobertura do Solo (ESA WorldCover 2021)", y);
      const lcItems = report.landcover.filter(lc => lc.areaKm2 > 0).slice(0, 8);
      const maxPct = lcItems[0]?.pct ?? 1;

      // Header row
      doc.setFillColor(226, 232, 240);
      doc.rect(MARGIN, y, CONTENT_W, 7, "F");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("Classe", MARGIN + 4, y + 5);
      doc.text("Área (km²)", W - MARGIN - 34, y + 5, { align: "right" });
      doc.text("Proporção", W - MARGIN, y + 5, { align: "right" });
      y += 7;

      lcItems.forEach((lc, i) => {
        const rowH = 6.2;
        if (i % 2 === 0) {
          doc.setFillColor(250, 252, 255);
          doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
        }
        try {
          const hc = lc.color.replace("#", "");
          const r = parseInt(hc.substring(0, 2), 16);
          const g = parseInt(hc.substring(2, 4), 16);
          const b = parseInt(hc.substring(4, 6), 16);
          if (!isNaN(r)) {
            doc.setFillColor(r, g, b);
            doc.roundedRect(MARGIN + 2.5, y + 1, 5.5, 4.2, 0.8, 0.8, "F");
          }
        } catch {}
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        const name = lc.label.length > 38 ? lc.label.slice(0, 36) + "…" : lc.label;
        doc.text(name, MARGIN + 13, y + 4.5);
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.text(lc.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 }), W - MARGIN - 34, y + 4.5, { align: "right" });
        const barW = Math.max((lc.pct / maxPct) * 14, 0.5);
        doc.setFillColor(2, 132, 199);
        doc.rect(W - MARGIN - 26, y + 2.5, barW, 2, "F");
        doc.setTextColor(2, 132, 199);
        doc.setFont("helvetica", "bold");
        doc.text(`${lc.pct}%`, W - MARGIN, y + 4.5, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += rowH;
      });
      y += 4;

      // ── MONTHLY PRECIPITATION ──
      y = sectionLabel(`Precipitação Mensal · ${report.precipAnnualMm.toLocaleString("pt-PT")} mm/ano`, y);
      const months = "JanFevMarAbrMaiJunJulAgoSetOutNovDez".match(/.{3}/g) || [];
      const barH = 32;
      const barArea = CONTENT_W - 4;
      const barGap = 1.5;
      const barW2 = Math.max(3, (barArea - months.length * barGap) / months.length);
      const maxMm = Math.max(...report.precipMonthly, 1);
      const py = y;

      for (let pct = 0; pct <= 1; pct += 0.25) {
        const ay = py + barH * (1 - pct);
        doc.setDrawColor(226, 232, 240);
        doc.line(MARGIN, ay, MARGIN + CONTENT_W, ay);
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(6);
        doc.text(`${Math.round(maxMm * pct)}`, MARGIN + 1, ay - 1);
      }

      report.precipMonthly.forEach((mm, i) => {
        const bx = MARGIN + 2 + i * (barW2 + barGap);
        const bh = (mm / maxMm) * barH;
        doc.setFillColor(59, 130, 246);
        doc.rect(bx, py + barH - bh, barW2, bh, "F");
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.text(months[i], bx + barW2 / 2, py + barH + 3.5, { align: "center" });
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        doc.text(`${Math.round(mm)}`, bx + barW2 / 2, py + barH - bh - 1.5, { align: "center" });
      });
      y += barH + 9;

      // ── RUNOFF / CN ──
      y = sectionLabel("Escoamento Superficial (SCS Curve Number)", y);
      const cn = report.runoff.cnMean;
      doc.setFillColor(26, 152, 80);
      doc.rect(MARGIN, y, CONTENT_W * 0.33, 5.5, "F");
      doc.setFillColor(254, 224, 139);
      doc.rect(MARGIN + CONTENT_W * 0.33, y, CONTENT_W * 0.34, 5.5, "F");
      doc.setFillColor(215, 48, 39);
      doc.rect(MARGIN + CONTENT_W * 0.67, y, CONTENT_W * 0.33, 5.5, "F");

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      const cnStr = cn != null ? `${cn.toFixed(1)}` : "—";
      doc.text(`CN Médio da Bacia: ${cnStr}`, MARGIN, y + 9.5);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Classificação SCS: menor = infiltração favorável · maior = escoamento superficial rápido", MARGIN, y + 14);
      y += 18;

      // ── RISK INDICES ──
      if (wsStats && (y + 26 < H - 16)) {
        y = sectionLabel("Índices de Risco", y);
        const riskItems = [
          { label: "Erosão", val: wsStats.erosionRisk, color: [245, 158, 11] as const },
          { label: "Cheia / Inundação", val: wsStats.floodRisk, color: [239, 68, 68] as const },
          { label: "Pot. Hidrogeológico", val: wsStats.hydroPotential, color: [16, 185, 129] as const },
        ];
        riskItems.forEach((ri) => {
          const [r, g, b] = ri.color;
          doc.setFillColor(r, g, b, 0.08);
          doc.roundedRect(MARGIN, y, CONTENT_W, 8.5, 2, 2, "F");
          doc.setDrawColor(r, g, b, 0.3);
          doc.roundedRect(MARGIN, y, CONTENT_W, 8.5, 2, 2, "S");
          doc.setTextColor(71, 85, 105);
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.text(ri.label, MARGIN + 4, y + 6);
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(MARGIN + 60, y + 2.5, 60, 3.5, 1.5, 1.5, "F");
          const bw = Math.max((Math.min(ri.val, 100) / 100) * 60, 2);
          doc.setFillColor(r, g, b);
          doc.roundedRect(MARGIN + 60, y + 2.5, bw, 3.5, 1.5, 1.5, "F");
          doc.setTextColor(r, g, b);
          doc.setFont("helvetica", "bold");
          doc.text(`${ri.val.toFixed(0)}/100`, W - MARGIN - 4, y + 6, { align: "right" });
          doc.setFont("helvetica", "normal");
          y += 10.5;
        });
      }

      addPDFFooter({ doc, pageNum, date, y: 0, title: "" });

      // ── QGIS CARTOGRAPHIC MAP PAGES ──
      const drawQgisMapPage = async (
        pageTitle: string,
        mapSubtitle: string,
        tileUrl: string | undefined,
        legendType: "lulc" | "cn",
      ) => {
        const startY = newPage_(pageTitle);
        const mapX = MARGIN;
        const mapY = startY + 4;
        const mapW = CONTENT_W;
        const mapH = 170;

        const b = computeGeoJsonBounds(wsData?.geojson);

        // Header inside page
        doc.setFillColor(248, 250, 252);
        doc.rect(mapX, startY, mapW, 8, "F");
        doc.setDrawColor(203, 213, 225);
        doc.rect(mapX, startY, mapW, 8, "S");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(mapSubtitle.toUpperCase(), mapX + 4, startY + 5.5);
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.text("Coordenadas WGS 84 · EPSG:4326", mapX + mapW - 4, startY + 5.5, { align: "right" });

        // Map image: Client-side Canvas rendering (CORS-safe, 100% reliable)
        try {
          const imgData = await renderBasinMapToDataUrl({
            bounds: b,
            geojson: wsData?.geojson,
            rasterTileUrl: tileUrl,
            drainageTileUrl: null,
            pourPoint: pourPoint,
            widthPx: 1400,
            heightPx: 950,
          });
          doc.addImage(imgData, "JPEG", mapX, mapY + 6, mapW, mapH);
        } catch (canvasErr) {
          console.warn("renderBasinMapToDataUrl failed, trying fetchMapImage fallback:", canvasErr);
          try {
            const legendPayload = legendType === "lulc"
              ? report.landcover.slice(0, 8).map(c => ({ label: c.label, color: c.color }))
              : [
                  { label: "CN < 50 (Infiltração Alta)", color: "#1a9850" },
                  { label: "CN 50-75 (Moderado)", color: "#fee08b" },
                  { label: "CN > 75 (Escoamento Alto)", color: "#d73027" },
                ];

            const imgData = await fetchMapImage(b, {
              tileUrl,
              overlayGeojson: wsData?.geojson as any,
              overlayLabel: "Bacia Delimitada",
              legendItems: legendPayload,
              title: mapSubtitle,
              dpi: 200,
              widthMm: mapW,
              heightMm: mapH,
            });
            doc.addImage(imgData, "PNG", mapX, mapY + 6, mapW, mapH);
          } catch (err) {
            console.warn("Cartopy map API failed, fallback to map container capture:", err);
            if (mapContainerRef.current) {
              try {
                const canvasData = await captureMapImage(mapContainerRef.current);
                doc.addImage(canvasData, "JPEG", mapX, mapY + 6, mapW, mapH);
              } catch (cErr) {
                console.warn("Capture fallback error:", cErr);
              }
            }
          }
        }

        // QGIS Frame Border
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(0.4);
        doc.rect(mapX, mapY + 6, mapW, mapH, "S");

        // Graticule ticks (Lat/Lon)
        drawCoordinateGrid(doc, mapX, mapY + 6, mapW, mapH, b.south, b.north, b.west, b.east);

        // North arrow
        drawNorthArrow(doc, mapX + mapW - 6, mapY + 12, 8);

        // Scale bar
        const approxDistKm = Math.max(10, Math.round((b.east - b.west) * 111 * Math.cos((b.south + b.north) * Math.PI / 360) * 0.3));
        drawGraphicScaleBar(doc, mapX + 8, mapY + mapH - 12, 34, approxDistKm);

        // Embedded Legend Panel
        const legX = mapX + 6;
        const legY = mapY + 12;
        const legW = 68;
        const legH = legendType === "lulc" ? 72 : 48;

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(legX, legY, legW, legH, 2, 2, "FD");

        doc.setFillColor(15, 23, 42);
        doc.roundedRect(legX, legY, legW, 6, 2, 2, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text(legendType === "lulc" ? "LEGENDA — USO DO SOLO" : "LEGENDA — ESCOAMENTO (CN)", legX + 4, legY + 4.2);

        let ly = legY + 9;

        if (legendType === "lulc") {
          report.landcover.slice(0, 7).forEach(lc => {
            try {
              const hc = lc.color.replace("#", "");
              const r = parseInt(hc.substring(0, 2), 16);
              const g = parseInt(hc.substring(2, 4), 16);
              const b = parseInt(hc.substring(4, 6), 16);
              doc.setFillColor(r, g, b);
              doc.rect(legX + 4, ly, 4, 3.2, "F");
            } catch {}
            doc.setDrawColor(148, 163, 184);
            doc.rect(legX + 4, ly, 4, 3.2, "S");
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(6);
            doc.setFont("helvetica", "normal");
            const lbl = lc.label.length > 20 ? lc.label.slice(0, 18) + "…" : lc.label;
            doc.text(`${lbl} (${lc.pct}%)`, legX + 11, ly + 2.5);
            ly += 4.8;
          });
        } else {
          const cnLegend = [
            { label: "CN < 50 · Alta Infiltração", color: [26, 152, 80] },
            { label: "CN 50–75 · Escoamento Médio", color: [254, 224, 139] },
            { label: "CN > 75 · Alto Escoamento", color: [215, 48, 39] },
          ];
          cnLegend.forEach(ci => {
            doc.setFillColor(ci.color[0], ci.color[1], ci.color[2]);
            doc.rect(legX + 4, ly, 4, 3.2, "F");
            doc.setDrawColor(148, 163, 184);
            doc.rect(legX + 4, ly, 4, 3.2, "S");
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(6);
            doc.setFont("helvetica", "normal");
            doc.text(ci.label, legX + 11, ly + 2.5);
            ly += 5.2;
          });
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "bold");
          doc.text(`CN Médio da Bacia: ${report.runoff.cnMean ?? "—"}`, legX + 4, ly + 2);
          ly += 5.2;
        }

        doc.setDrawColor(2, 132, 199);
        doc.setLineWidth(0.7);
        doc.line(legX + 4, ly + 1.5, legX + 8, ly + 1.5);
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.text("Rede de Drenagem / Linhas de Água", legX + 11, ly + 2);
        ly += 4.8;

        doc.setDrawColor(13, 71, 161);
        doc.setLineWidth(0.6);
        doc.setFillColor(21, 101, 192, 0.2);
        doc.rect(legX + 4, ly, 4, 3, "FD");
        doc.text("Limite da Bacia Hidrográfica", legX + 11, ly + 2.2);

        // Metadata block
        const metaY = mapY + mapH + 8;
        doc.setFillColor(248, 250, 252);
        doc.rect(mapX, metaY, mapW, 14, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(mapX, metaY, mapW, 14, "S");

        doc.setTextColor(71, 85, 105);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text("METADADOS CARTOGRÁFICOS:", mapX + 3, metaY + 4.5);
        doc.setFont("helvetica", "normal");
        doc.text(
          "Sistema de Coordenadas: WGS 84 (EPSG:4326) · Projeção Geográfica Decimal\n" +
          "Fontes de Dados: ESA WorldCover (10m), HydroSHEDS / WWF, Copernicus DEM (GLO-30), CHIRPS Climatology\n" +
          "Elaborado por: GeoMoz Explorer · HidroGeoMoz",
          mapX + 3,
          metaY + 8,
        );

        addPDFFooter({ doc, pageNum, date, y: 0, title: "" });
      };

      if (type === "lulc" || type === "both") {
        await drawQgisMapPage(
          "Mapa 1: Uso do Solo & Linhas de Água",
          "Uso e Cobertura do Solo (ESA WorldCover 10m) & Rede Hidrográfica",
          report.landcoverTile,
          "lulc",
        );
      }

      if (type === "cn" || type === "both") {
        await drawQgisMapPage(
          "Mapa 2: Escoamento Superficial (CN)",
          "Escoamento Superficial (SCS Curve Number) & Rede Hidrográfica",
          report.runoff.cnTile,
          "cn",
        );
      }

      const fileDate = new Date().toISOString().slice(0, 10);
      doc.save(`GeoMoz_QGIS_Bacia_${PP[0].toFixed(3)}_${PP[1].toFixed(3)}_${fileDate}.pdf`);
      setPdfExportModalOpen(false);
    } catch (e: any) {
      console.error("PDF export failed:", e);
      toast({ variant: "destructive", title: "Erro na exportação", description: e.message || String(e) });
    } finally {
      setExportingPdf(false);
    }
  }

  // Exports
  function exportCSV(s: BasinStats, label: string) {
    const rows = [["Métrica","Valor","Unidade"],
      ["Área", s.areaKm2, "km²"], ["Perímetro", s.perimeterKm, "km"],
      ["Elev. mín.", s.elevMinM, "m"], ["Elev. média", s.elevMeanM, "m"], ["Elev. máx.", s.elevMaxM, "m"],
      ["Declive médio", s.slopeMeanDeg, "°"], ["NDVI médio", s.ndviMean ?? "—", ""],
      ["NDWI médio", s.ndwiMean ?? "—", ""], ["Precipitação", s.precipMmYr, "mm/ano"],
      ["Risco erosão", s.erosionRisk, "/100"], ["Risco cheia", s.floodRisk, "/100"],
      ["Pot. hidrogeológico", s.hydroPotential, "/100"]];
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${label}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }
  function exportGeoJSON(data: GeoJSON.GeoJsonObject, name: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${name}.geojson` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  // Chart data
  const lithoData = (statsData?.lithologies ?? []).slice(0, 7).map((l, i) => ({
    name: l.name.length > 13 ? l.name.slice(0, 13) + "…" : l.name,
    value: +l.percent.toFixed(1),
    color: ["#1a73e8","#34a853","#fbbc04","#ea4335","#9c27b0","#00bcd4","#ff5722"][i],
  }));

  const activeStats = mode === "delineate" ? wsStats : basinStats;
  const hasRightContent = mode === "delineate"
    ? (loadingWS || loadingWsSt || pourPoint !== null || wsStats !== null)
    : (selectedFeat !== null || (aoi.source === "mozambique" && statsData !== null) || loadingStats);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Sidebar Toggle (always visible) ─────────────────────────────── */}
      <button
        onClick={() => setSidebarOpen(o => !o)}
        className="z-[700] absolute left-0 top-1/2 -translate-y-1/2 w-5 h-16 bg-white dark:bg-slate-900 border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-lg flex items-center justify-center shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        style={{ left: sidebarOpen ? "17rem" : 0 }}
        title={sidebarOpen ? "Recolher" : "Expandir"}
      >
        {sidebarOpen ? <ChevronLeft size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
      </button>

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto shrink-0 transition-all duration-200 ${sidebarOpen ? "w-68" : "w-0 overflow-hidden"}`}
        style={{ width: sidebarOpen ? "272px" : "0px" }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm shrink-0">
              <Droplets size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bacias Hidrográficas</h2>
              <p className="text-[10px] text-slate-400">HydroSHEDS · GEE · DEM GLO-30</p>
            </div>
          </div>
          {geeStatus && (
            <div className={`mt-2 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg ${geeStatus.connected ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"}`}>
              {geeStatus.connected ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
              {geeStatus.connected ? "GEE conectado" : "GEE offline"}
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {([["delineate","Delimitar",Crosshair],["explore","Explorar",Layers]] as const).map(([m, label, Icon]) => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all ${mode === m ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSavedModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-semibold transition-all shadow-sm group"
          >
            <span className="flex items-center gap-1.5">
              <FolderOpen size={13} className="text-blue-500 group-hover:text-blue-600" />
              <span>Análises Guardadas</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-300 font-mono font-bold">
              {savedAnalyses.length}
            </span>
          </button>
        </div>

        {/* Área de estudo — AOI global */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Área de Estudo</h4>
          <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
        </div>

        {/* Explore config */}
        {mode === "explore" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Configuração</h4>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
              <span>As bacias pré-definidas (HydroBASINS) podem não estar disponíveis neste projeto. Se nada aparecer, use <strong>Delimitar</strong> para delinear por DEM.</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">HydroBASINS — <strong className="text-slate-700 dark:text-slate-200">Nível {basinLevel}</strong></label>
              <input type="range" min={5} max={8} step={1} value={basinLevel} onChange={e => setBasinLevel(+e.target.value)} className="w-full accent-blue-500" />
              <div className="flex justify-between text-[10px] text-slate-400"><span>Grandes (5)</span><span>Detalhe (8)</span></div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500 dark:text-slate-400">Rede de Drenagem</label>
              <input type="checkbox" checked={showDrainage} onChange={e => setShowDrainage(e.target.checked)} className="accent-blue-500" />
            </div>
            {showDrainage && (
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">Limiar acumulação</label>
                <input type="range" min={100} max={2000} step={100} value={drainThresh} onChange={e => setDrainThresh(+e.target.value)} className="w-full accent-cyan-500" />
                <div className="flex justify-between text-[10px] text-slate-400"><span>Cabeceiras</span><span>Rios principales</span></div>
              </div>
            )}
            <button onClick={loadBasins} disabled={loadingBasins}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
              {loadingBasins ? <><Loader2 size={12} className="animate-spin" /> A carregar…</> : <><Play size={12} /> Carregar Bacias</>}
            </button>
          </div>
        )}

        {/* Delineate config */}
        {mode === "delineate" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            {/* Delineation Method Selector */}
            <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-2">
              <button
                type="button"
                onClick={() => setDelineateMethod("point")}
                className={`flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                  delineateMethod === "point"
                    ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <Crosshair size={11} /> Ponto (Exutório)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDelineateMethod("polygon");
                  if (aoi.geometry) {
                    delineateByPolygon(aoi.geometry, aoi.label);
                  }
                }}
                className={`flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-lg transition-all ${
                  delineateMethod === "polygon"
                    ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <PenTool size={11} /> Por Polígono / AOI
              </button>
            </div>

            {delineateMethod === "point" ? (
              <>
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-blue-500" />
                  <span>Clique num rio ou ponto no mapa para traçar a sub-bacia a montante (HydroBASINS/D8).</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">Detalhe — <strong className="text-slate-700 dark:text-slate-200">nível {level}</strong></label>
                  <input type="range" min={6} max={12} step={1} value={level} onChange={e => setLevel(+e.target.value)} className="w-full accent-blue-500" />
                  <div className="flex justify-between text-[10px] text-slate-400"><span>Grande (6)</span><span>Pequena (12)</span></div>
                </div>
                {pourPoint && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-0.5">
                    <div className="text-[10px] font-semibold text-slate-400 not-italic mb-1">Ponto seleccionado</div>
                    <div>Lat {pourPoint[0].toFixed(5)} · Lon {pourPoint[1].toFixed(5)}</div>
                    {watershedData && <div className="text-blue-700 dark:text-blue-400 font-bold not-italic">{watershedData.areaKm2.toLocaleString("pt-PT")} km²</div>}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                  <Info size={12} className="mt-0.5 shrink-0 text-blue-500" />
                  <span>Delimita e recorta as <strong>bacias e linhas de água</strong> estritamente aos limites do seu polígono ou área de estudo.</span>
                </div>

                <div className="space-y-2">
                  {aoi.geometry ? (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-[11px] space-y-2">
                      <div className="text-slate-500 dark:text-slate-400 text-[10px]">Polígono / AOI ativa:</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{aoi.label || "Área Personalizada"}</div>
                      <button
                        type="button"
                        onClick={() => delineateByPolygon(aoi.geometry, aoi.label)}
                        disabled={loadingWS}
                        className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
                      >
                        {loadingWS ? <><Loader2 size={11} className="animate-spin" /> A recortar bacia…</> : <><Play size={11} /> Delimitar & Recortar por esta Área</>}
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2">
                      Nenhum polígono ativo. Desenhe um polígono ou carregue um arquivo vetorial.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setDrawingEnabled(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <PenTool size={11} /> {drawingEnabled ? "A desenhar no mapa…" : "Desenhar Novo Polígono"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* River network */}
        <div className="p-3 space-y-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><GitBranch size={10} /> Linhas de Água</h4>
            {riverNet && <input type="checkbox" checked={showRiverNet} onChange={e => setShowRiverNet(e.target.checked)} className="accent-blue-500" />}
          </div>
          {riverNet && showRiverNet && (
            <div className="flex items-center gap-1.5">
              <input type="checkbox" checked={showAllOrders} onChange={e => setShowAllOrders(e.target.checked)} className="accent-cyan-500" />
              <span className="text-[10px] text-slate-600 dark:text-slate-300">Todas as ordens</span>
            </div>
          )}
          <button onClick={loadRiverNetwork} disabled={loadingRN}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors">
            {loadingRN ? <><Loader2 size={11} className="animate-spin" /> A gerar…</> : <><RefreshCw size={11} /> {riverNet ? "Atualizar" : "Gerar Linhas de Água"}</>}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="m-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-2.5 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* Hint */}
        {mode === "explore" && !selectedFeat && basinsData?.source === "hydrobasins" && (
          <div className="m-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl p-2.5 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0" />Clique numa bacia no mapa para ver estatísticas detalhadas no painel direito.
          </div>
        )}
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <div className={`flex-1 relative overflow-hidden ${mode === "delineate" && delineateMethod === "point" && !drawingEnabled ? "cursor-crosshair" : ""}`} ref={mapContainerRef}>
        <BasemapSwitcher
          current={basemap}
          onChange={setBasemap}
          className="absolute bottom-16 sm:bottom-6 left-4 z-[600]"
          position="bottom-left"
          show3dToggle={false}
        />
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} ref={mapRef} zoomControl={false}>
              <ZoomControl position="topright" />
              <MapTools />
              <ScaleControl position="bottomright" imperial={false} />
              <MapClickHandler onMapClick={onMapClick} active={mode === "delineate" && delineateMethod === "point" && !drawingEnabled} />

              <TileLayer
                key={basemap}
                crossOrigin="anonymous"
                url={GOOGLE_BASEMAPS[basemap].url}
                subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
                attribution={GOOGLE_BASEMAPS[basemap].attribution}
                maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
              />

              <AreaSelect
                province={province} district={district}
                onProvinceChange={p => { onProvinceChange(p); onDistrictChange(null); }}
                onDistrictChange={onDistrictChange}
                selectable={mode === "explore"}
              />

              {/* River network */}
              {showRiverNet && riverNet && (
                <TileLayer crossOrigin="anonymous" key={`rn-${showAllOrders}-${riverNet.tileUrl}`}
                  url={showAllOrders ? riverNet.tileUrl : riverNet.majorTileUrl}
                  attribution="HydroSHEDS · WWF" opacity={showAllOrders ? 0.75 : 0.9} maxZoom={18} />
              )}

              {/* Drainage (explore, no river net) */}
              {mode === "explore" && showDrainage && drainageTile && !showRiverNet && (
                <TileLayer crossOrigin="anonymous" key={`drain-${drainageTile.tileUrl}`} url={drainageTile.tileUrl}
                  attribution="HydroSHEDS · WWF" opacity={0.85} maxZoom={18} />
              )}

              {/* Basins GeoJSON */}
              {mode === "explore" && basinsData?.geojson && (
                <GeoJSON key={`basins-${basinLevel}-${province}-${district}`}
                  data={basinsData.geojson as GeoJSON.GeoJsonObject}
                  style={f => basinStyle(f)}
                  onEachFeature={(feat, layer: Layer) => {
                    const p = feat.properties ?? {};
                    layer.bindTooltip(`<div class="text-xs"><b>Bacia ${p.HYBAS_ID ?? "—"}</b><br/>Área: ${(p.SUB_AREA ?? 0).toFixed(0)} km²</div>`, { sticky: true });
                    layer.on("click", () => onBasinClick(feat));
                  }} />
              )}

              {/* Watershed polygon */}
              {watershedData?.geojson && (
                <>
                  <GeoJSON key={`ws-${pourPoint?.[0]}-${pourPoint?.[1]}`}
                    data={watershedData.geojson as GeoJSON.GeoJsonObject}
                    style={{ color: "#0d47a1", weight: 2.5, fillColor: "#1565c0", fillOpacity: 0.2, opacity: 1 }} />
                  <TileLayer crossOrigin="anonymous" key={`wst-${watershedData.tileUrl}`} url={watershedData.tileUrl} opacity={0.3} maxZoom={18} />
                </>
              )}

              {/* Delineated watershed drainage lines / Rede de linhas de água da bacia */}
              {watershedData && showWatershedDrainage && watershedDrainageTile && (
                <TileLayer crossOrigin="anonymous" key={`ws-drain-${watershedDrainageTile}`}
                  url={watershedDrainageTile} attribution="HydroSHEDS · WWF" opacity={0.9} zIndex={450} maxZoom={18} />
              )}

              {/* Basin report overlays (toggleable): land cover / SCS-CN runoff */}
              {basinReport && reportLayer === "lulc" && (
                <TileLayer crossOrigin="anonymous" key={`rep-lulc-${basinReport.landcoverTile}`} url={basinReport.landcoverTile}
                  attribution="GEE · ESA WorldCover 2021" opacity={0.75} maxZoom={18} />
              )}
              {basinReport && reportLayer === "cn" && (
                <TileLayer crossOrigin="anonymous" key={`rep-cn-${basinReport.runoff.cnTile}`} url={basinReport.runoff.cnTile}
                  attribution="GEE · SCS Curve Number" opacity={0.7} maxZoom={18} />
              )}

              {/* Pour point marker */}
              {pourPoint && (
                <CircleMarker center={pourPoint} radius={9}
                  pathOptions={{ fillColor: "#ef4444", color: "#ffffff", weight: 3, fillOpacity: 1 }} />
              )}
              <MapDraw
                enabled={drawingEnabled}
                hasDrawnAOI={aoi.source === "draw"}
                onClearAOI={() => onAOIChange(GLOBAL_AOI)}
                onDrawComplete={(geom, label) => {
                  setDrawingEnabled(false);
                  const newAoi = customAOI(geom, label, "draw");
                  onAOIChange(newAoi);
                  if (mode === "delineate") {
                    setDelineateMethod("polygon");
                    delineateByPolygon(geom, label);
                  }
                }}
                onCancel={() => setDrawingEnabled(false)}
              />
            </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-blue-100 dark:border-blue-900/40 p-3 pointer-events-none text-[11px] min-w-[130px]">
          {mode === "explore" ? (
            <>
              <div className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1"><Droplets size={11} /> HydroBASINS</div>
              <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-5 h-1.5 rounded border border-blue-500 bg-blue-500/10" /><span className="text-slate-600 dark:text-slate-300">Bacia</span></div>
              <div className="flex items-center gap-1.5"><span className="inline-block w-5 h-1.5 rounded border border-amber-400 bg-amber-400/25" /><span className="text-slate-600 dark:text-slate-300">Seleccionada</span></div>
            </>
          ) : (
            <>
              <div className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1"><Crosshair size={11} /> Sub-bacia</div>
              <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm" /><span className="text-slate-600 dark:text-slate-300">Ponto clicado</span></div>
              <div className="flex items-center gap-1.5"><span className="inline-block w-5 h-1.5 rounded border-2 border-blue-800 bg-blue-600/20" /><span className="text-slate-600 dark:text-slate-300">Bacia delimitada</span></div>
              {showWatershedDrainage && watershedDrainageTile && (
                <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="inline-block w-5 h-1 rounded bg-[#0284c7]" />
                  <span className="text-slate-600 dark:text-slate-300">Linhas de água</span>
                </div>
              )}
            </>
          )}
          {showRiverNet && riverNet && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-cyan-800 dark:text-cyan-300 mb-1 flex items-center gap-1"><GitBranch size={10} /> Linhas de Água</div>
              {showAllOrders ? (
                ["#a8d5f7","#5badf5","#1a73e8","#0d47a1","#002171"].map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-block w-5 h-1 rounded" style={{ background: c }} />
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">{["Cabeceiras","Pequenos","Médios","Grandes","Principais"][i]}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5"><span className="inline-block w-5 h-1 rounded bg-[#002171]" /><span className="text-slate-500 dark:text-slate-400">Rios principais</span></div>
              )}
            </div>
          )}
        </div>

        {/* Top banner (delineate mode) */}
        {mode === "delineate" && delineateMethod === "point" && !drawingEnabled && !pourPoint && !loadingWS && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-blue-700/90 backdrop-blur text-white rounded-full px-4 py-2 text-xs font-medium flex items-center gap-2 shadow-lg pointer-events-none">
            <Crosshair size={13} /> Clique no mapa para definir o ponto de saída da bacia
          </div>
        )}
        {mode === "explore" && basinsData?.source === "hydrobasins" && (
          <div className="absolute top-4 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-sm border border-blue-100 dark:border-blue-900/40 px-3 py-1.5 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5 pointer-events-none">
            <Layers size={11} />{basinsData.count} bacias · Nível {basinsData.level}
          </div>
        )}

        {/* Loading overlay */}
        {(loadingBasins || loadingWS || loadingRN) && (
          <div className="absolute inset-0 z-[600] bg-white/55 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 px-7 py-5 flex items-center gap-3">
              <Loader2 size={20} className="text-blue-500 animate-spin" />
              <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                {loadingBasins ? "A carregar bacias HydroBASINS…"
                  : loadingWS ? "A delinear sub-bacia (HydroBASINS)…"
                  : "A gerar rede de linhas de água…"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel ──────────────────────────────────────────────────── */}
      {hasRightContent && (
        <div className="w-80 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-y-auto shrink-0">

          {/* ── DELINEATE mode right panel ───────────────────────────────── */}
          {mode === "delineate" && (
            <>
              {/* Watershed header */}
              <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownCircle size={15} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bacia Delimitada</span>
                </div>
                {pourPoint && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {pourPoint[0].toFixed(4)}° / {pourPoint[1].toFixed(4)}°
                  </div>
                )}
              </div>

              {/* Loading watershed */}
              {loadingWS && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 py-10">
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                  <span className="text-sm text-center px-4">A delinear sub-bacia (HydroBASINS)…</span>
                </div>
              )}

              {/* Watershed result */}
              {!loadingWS && watershedData && (
                <div className="flex-1 p-4 space-y-5 overflow-y-auto">

                  {/* Area highlight */}
                  <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-4 text-white">
                    <div className="text-xs opacity-75 mb-1">Área Total da Bacia</div>
                    <div className="text-3xl font-bold">{watershedData.areaKm2.toLocaleString("pt-PT")}</div>
                    <div className="text-xs opacity-75">km²</div>
                    <div className="mt-2 text-xs opacity-70">
                      {watershedData.source === "hydrobasins"
                        ? `HydroBASINS · nível ${watershedData.level ?? level}`
                        : watershedData.source === "polygon"
                        ? "Delimitação por Polígono / Área de Estudo"
                        : "D8 · HydroSHEDS"}
                    </div>
                  </div>

                  {/* Linhas de Água da Bacia Delimitada */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <GitBranch size={13} className="text-cyan-500" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Linhas de Água da Bacia
                        </span>
                      </div>
                      <button
                        onClick={() => setShowWatershedDrainage(v => !v)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                          showWatershedDrainage
                            ? "bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {showWatershedDrainage ? "Visível" : "Oculto"}
                      </button>
                    </div>

                    {loadingWatershedDrainage ? (
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 py-1.5">
                        <Loader2 size={12} className="animate-spin text-cyan-500" />
                        <span>A traçar canais e afluentes no GEE…</span>
                      </div>
                    ) : watershedDrainageTile ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Rede hidrográfica recortada ao interior da bacia (HydroSHEDS).
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <label className="text-[10px] text-slate-400 shrink-0">Densidade:</label>
                          <select
                            value={watershedDrainThresh}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setWatershedDrainThresh(val);
                              const geom = watershedData?.geojson?.features?.[0]?.geometry ?? watershedData?.geojson;
                              if (geom) loadWatershedDrainage(geom, val);
                            }}
                            className="flex-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          >
                            <option value={100}>Muito Alta (100 px)</option>
                            <option value={250}>Alta (250 px)</option>
                            <option value={500}>Média (500 px)</option>
                            <option value={1000}>Baixa (1000 px)</option>
                          </select>
                          <button
                            onClick={() => {
                              const geom = watershedData?.geojson?.features?.[0]?.geometry ?? watershedData?.geojson;
                              if (geom) loadWatershedDrainage(geom, watershedDrainThresh);
                            }}
                            title="Recalcular linhas de água"
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const geom = watershedData?.geojson?.features?.[0]?.geometry ?? watershedData?.geojson;
                          if (geom) loadWatershedDrainage(geom, watershedDrainThresh);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 border border-cyan-200 dark:border-cyan-800/50 text-cyan-700 dark:text-cyan-300 text-[11px] font-medium rounded-lg transition-colors"
                      >
                        <GitBranch size={11} /> Gerar Linhas de Água
                      </button>
                    )}
                  </div>

                  {/* Stats loading (separate from basin delineation) */}
                  {loadingWsSt && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
                      <Loader2 size={13} className="animate-spin text-blue-400" /> A calcular estatísticas GEE (declive, NDVI, chuva)…
                    </div>
                  )}

                  {/* Morphometry */}
                  {wsStats && !loadingWsSt && (
                    <>
                      <div>
                        <SectionHeader title="Morfometria" icon={Mountain} />
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-0">
                          <StatRow label="Elev. mínima" value={wsStats.elevMinM.toFixed(0)} unit=" m" />
                          <StatRow label="Elev. média" value={wsStats.elevMeanM.toFixed(0)} unit=" m" />
                          <StatRow label="Elev. máxima" value={wsStats.elevMaxM.toFixed(0)} unit=" m" />
                          <StatRow label="Declive médio" value={wsStats.slopeMeanDeg.toFixed(1)} unit="°" />
                        </div>
                      </div>

                      <div>
                        <SectionHeader title="Vegetação & Clima" icon={Activity} />
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-0">
                          <StatRow label="NDVI médio" value={wsStats.ndviMean != null ? wsStats.ndviMean.toFixed(3) : "—"} />
                          <StatRow label="NDWI médio" value={wsStats.ndwiMean != null ? wsStats.ndwiMean.toFixed(3) : "—"} />
                          <StatRow label="Precipitação" value={wsStats.precipMmYr.toFixed(0)} unit=" mm/ano" />
                        </div>
                      </div>

                      <div>
                        <SectionHeader title="Índices de Risco" icon={Gauge} />
                        <div className="space-y-3">
                          <RiskBar label="Erosão" value={wsStats.erosionRisk} icon={Wind} />
                          <RiskBar label="Cheia / Inundação" value={wsStats.floodRisk} icon={Waves} />
                          <RiskBar label="Pot. Hidrogeológico" value={wsStats.hydroPotential} icon={Zap} invert />
                        </div>
                      </div>
                    </>
                  )}

                  {loadingWsSt && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                      <Loader2 size={14} className="animate-spin text-blue-400" /> A calcular estatísticas…
                    </div>
                  )}

                  {/* Exports */}
                  <div>
                    <SectionHeader title="Exportar" icon={Download} />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => exportGeoJSON(watershedData.geojson, `watershed_${pourPoint?.[0].toFixed(3)}_${pourPoint?.[1].toFixed(3)}`)}
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl transition-colors">
                        <FileText size={12} /> GeoJSON
                      </button>
                      {wsStats && (
                        <button
                          onClick={() => exportCSV(wsStats, `watershed_${pourPoint?.[0].toFixed(3)}`)}
                          className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors">
                          <Download size={12} /> CSV Stats
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Full hydro-environmental report */}
                  <div>
                    <SectionHeader title="Relatório de Bacia" icon={FileText} />
                    {!basinReport && (
                      <button onClick={runBasinReport} disabled={loadingReport}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
                        {loadingReport
                          ? <><Loader2 size={12} className="animate-spin" /> A processar no GEE… (~10 s)</>
                          : <><BarChart2 size={12} /> Gerar Relatório Completo</>}
                      </button>
                    )}
                    {basinReport && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            ["Relevo", `${basinReport.morphometry.reliefM} m`],
                            ["Declive méd.", `${basinReport.morphometry.slopeMeanDeg}°`],
                            ["Elev. máx.", `${basinReport.morphometry.elevMaxM} m`],
                            ["Dens. dren.", `${basinReport.morphometry.drainageDensity}`],
                            ["Compacidade", `${basinReport.morphometry.compactness}`],
                            ["Fator forma", `${basinReport.morphometry.formFactor}`],
                          ] as const).map(([k, v]) => (
                            <div key={k} className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
                              <div className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight">{k}</div>
                              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{v}</div>
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Uso do Solo</div>
                          <div className="space-y-1">
                            {basinReport.landcover.slice(0, 6).map(c => (
                              <div key={c.code} className="flex items-center gap-2 text-[11px]">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                                <span className="text-slate-600 dark:text-slate-300 flex-1 truncate">{c.label}</span>
                                <span className="text-slate-400 font-mono">{c.pct}%</span>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => setReportLayer(l => l === "lulc" ? "none" : "lulc")}
                            className={`mt-1.5 w-full text-[10px] py-1 rounded-lg border transition-colors ${reportLayer === "lulc" ? "bg-lime-100 dark:bg-lime-950/40 border-lime-300 dark:border-lime-800 text-lime-700 dark:text-lime-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                            {reportLayer === "lulc" ? "Ocultar no mapa" : "Ver no mapa"}
                          </button>
                        </div>

                        <div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Chuva mensal · {basinReport.precipAnnualMm.toLocaleString("pt-PT")} mm/ano</div>
                          <ResponsiveContainer width="100%" height={110}>
                            <BarChart data={basinReport.precipMonthly.map((v, i) => ({ m: "JFMAMJJASOND"[i], mm: v }))}
                              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                              <XAxis dataKey="m" tick={{ fontSize: 9 }} interval={0} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                              <Tooltip formatter={(v: number) => [`${v} mm`, "Chuva"]} />
                              <Bar dataKey="mm" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-slate-600 dark:text-slate-300">Escoamento — CN médio</div>
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{basinReport.runoff.cnMean ?? "—"}</div>
                          </div>
                          <div className="h-2 rounded-full mt-1.5" style={{ background: "linear-gradient(to right,#1a9850,#fee08b,#d73027)" }} />
                          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>40 · infiltra</span><span>escoa · 100</span></div>
                          <button onClick={() => setReportLayer(l => l === "cn" ? "none" : "cn")}
                            className={`mt-1.5 w-full text-[10px] py-1 rounded-lg border transition-colors ${reportLayer === "cn" ? "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                            {reportLayer === "cn" ? "Ocultar no mapa" : "Ver mapa de escoamento"}
                          </button>
                        </div>

                        {/* WebGIS Share, Save & PDF Download */}
                        <div className="pt-1 space-y-2">
                          <button
                            type="button"
                            onClick={handleSaveAnalysis}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-emerald-600/20"
                          >
                            <BookmarkCheck size={14} /> Guardar no Arquivo Permanente
                          </button>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={handleShareWebGis}
                              className="flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-slate-700 text-xs font-semibold rounded-xl transition-all shadow-sm"
                            >
                              <Share2 size={12} className="text-cyan-500" /> Partilhar Link
                            </button>
                            <button
                              type="button"
                              onClick={handleExportStandaloneHtml}
                              className="flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-slate-700 text-xs font-semibold rounded-xl transition-all shadow-sm"
                              title="Exportar como ficheiro HTML autónomo que abre em qualquer computador offline"
                            >
                              <Globe size={12} className="text-blue-500" /> Exportar HTML
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setPdfExportModalOpen(true)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
                          >
                            <FileDown size={13} /> Exportar Relatório PDF (QGIS)
                          </button>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            Guarde permanentemente, partilhe via WebGIS, descarregue em HTML autónomo ou exporte em PDF estilo QGIS.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                    <Info size={12} className="mt-0.5 shrink-0 text-blue-500" />
                    {watershedData.source === "polygon"
                      ? "Métricas, rede de drenagem e bacias recortadas estritamente aos limites da sua área de estudo."
                      : "Sub-bacia HydroBASINS (limite oficial WWF/HydroSHEDS). Para análise definitiva, recomenda-se validação de campo."}
                  </div>
                </div>
              )}

              {/* No result yet */}
              {!loadingWS && !watershedData && pourPoint && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 py-10">
                  <AlertTriangle size={20} className="text-amber-400" />
                  <span className="text-sm">Nenhum resultado. Verifique o ponto seleccionado.</span>
                </div>
              )}
            </>
          )}

          {/* ── EXPLORE mode right panel ─────────────────────────────────── */}
          {mode === "explore" && (
            <>
              <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <BarChart2 size={14} className="text-blue-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedFeat ? `Bacia ${selectedFeat.properties?.HYBAS_ID ?? "—"}` : "Análise da Área"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{province ?? "Moçambique"}{district ? ` / ${district}` : ""}</p>
              </div>

              <div className="flex-1 p-4 space-y-5 overflow-y-auto">

                {/* Basin morphometry (after click) */}
                {(loadingStats || basinStats) && (
                  <div>
                    <SectionHeader title="Morfometria da Bacia" icon={Mountain} />
                    {loadingStats && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                        <Loader2 size={14} className="animate-spin text-blue-400" /> A calcular via GEE…
                      </div>
                    )}
                    {basinStats && !loadingStats && (
                      <>
                        {/* Area highlight */}
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-4 text-white mb-3">
                          <div className="text-xs opacity-75 mb-1">Área da Bacia</div>
                          <div className="text-2xl font-bold">{basinStats.areaKm2.toLocaleString("pt-PT")}</div>
                          <div className="text-xs opacity-75">km²  ·  Perím. {basinStats.perimeterKm.toFixed(0)} km</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-0 mb-3">
                          <StatRow label="Elev. mínima" value={basinStats.elevMinM.toFixed(0)} unit=" m" />
                          <StatRow label="Elev. média" value={basinStats.elevMeanM.toFixed(0)} unit=" m" />
                          <StatRow label="Elev. máxima" value={basinStats.elevMaxM.toFixed(0)} unit=" m" />
                          <StatRow label="Declive médio" value={basinStats.slopeMeanDeg.toFixed(1)} unit="°" />
                          <StatRow label="NDVI médio" value={basinStats.ndviMean != null ? basinStats.ndviMean.toFixed(3) : "—"} />
                          <StatRow label="Precipitação" value={basinStats.precipMmYr.toFixed(0)} unit=" mm/ano" />
                        </div>

                        <div className="mb-3">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Gauge size={10} /> Índices de Risco</div>
                          <div className="space-y-3">
                            <RiskBar label="Erosão" value={basinStats.erosionRisk} icon={Wind} />
                            <RiskBar label="Cheia / Inundação" value={basinStats.floodRisk} icon={Waves} />
                            <RiskBar label="Pot. Hidrogeológico" value={basinStats.hydroPotential} icon={Zap} invert />
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Download size={10} /> Exportar</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => exportCSV(basinStats, `bacia_${selectedFeat?.properties?.HYBAS_ID ?? "sel"}`)}
                              className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors">
                              <Download size={11} /> CSV Stats
                            </button>
                            {selectedFeat && (
                              <button onClick={() => exportGeoJSON(selectedFeat as GeoJSON.Feature, `bacia_${selectedFeat.properties?.HYBAS_ID ?? "sel"}`)}
                                className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl transition-colors">
                                <FileText size={11} /> GeoJSON
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-slate-100 dark:border-slate-800 pt-4" />
                      </>
                    )}
                  </div>
                )}

                {/* Geology charts (Only for Mozambique and when no specific basin is selected) */}
                {aoi.source === "mozambique" && !selectedFeat && lithoData.length > 0 && (
                  <div>
                    <SectionHeader title="Top Litologias por Área" icon={Activity} />
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={lithoData} layout="vertical" margin={{ left: 4, right: 8, top: 0, bottom: 0 }}>
                        <XAxis type="number" domain={[0,100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={74} />
                        <Tooltip formatter={(v: number) => [`${v}%`, "Área"]} />
                        <Bar dataKey="value" radius={[0, 3, 3, 0]}>{lithoData.map((d,i) => <Cell key={i} fill={d.color} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Geology table (Only for Mozambique and when no specific basin is selected) */}
                {aoi.source === "mozambique" && !selectedFeat && statsData && (
                  <div>
                    <SectionHeader title="Unidades Geológicas" icon={Layers} />
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800">
                            <th className="text-left p-2 text-slate-500 dark:text-slate-400 font-medium">Litologia</th>
                            <th className="text-right p-2 text-slate-500 dark:text-slate-400 font-medium">km²</th>
                            <th className="text-right p-2 text-slate-500 dark:text-slate-400 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsData.lithologies.slice(0, 8).map((l, i) => (
                            <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                              <td className="p-2 text-slate-700 dark:text-slate-200 truncate max-w-[110px]" title={l.name}>{l.name}</td>
                              <td className="p-2 text-right text-slate-600 dark:text-slate-300 font-mono">{l.areaKm2.toFixed(0)}</td>
                              <td className="p-2 text-right text-slate-600 dark:text-slate-300 font-mono">{l.percent.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {statsData.dominant && (
                      <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                        <Info size={9} /> Dominante: <strong className="text-slate-600 dark:text-slate-300 ml-0.5">{statsData.dominant}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!selectedFeat && !basinStats && (!statsData || aoi.source !== "mozambique") && (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
                    <Globe size={24} className="text-slate-300 dark:text-slate-600" />
                    <span className="text-sm text-center">Selecione uma área ou carregue as bacias para ver análise geocientífica.</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal de Partilha WebGIS ────────────────────────────────────── */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
                  <Share2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Partilhar Análise (WebGIS)</h3>
                  <p className="text-[11px] text-slate-400">Link público interativo de visualização (Apenas Leitura)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs p-1"
              >
                <X size={14} />
              </button>
            </div>

            <div className="my-4 space-y-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-3 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-blue-500" />
                <span>
                  Este link permite que qualquer utilizador visualize o mapa interativo da bacia, consulte métricas e faça o download do PDF.
                  <strong> Não permite processamentos adicionais nem consome quota do seu GEE.</strong>
                </span>
              </div>

              {shareLoading ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-cyan-500" />
                  <span className="text-xs">A gerar link WebGIS...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Link de Visualização:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200 select-all focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2500);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shrink-0"
                    >
                      {shareCopied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                      <span>{shareCopied ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
              >
                Fechar
              </button>
              {shareUrl && (
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
                >
                  <ExternalLink size={13} /> Abrir Visualizador
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Exportação PDF QGIS ─────────────────────────────────── */}
      {pdfExportModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
                  <FileDown size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Exportação Cartográfica (Estilo QGIS)</h3>
                  <p className="text-[11px] text-slate-400">Selecione os mapas e elementos a incluir no PDF</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPdfExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs p-1"
              >
                <X size={14} />
              </button>
            </div>

            <div className="my-4 space-y-2.5 text-xs">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Composição do Relatório PDF:
              </label>

              {[
                {
                  id: "both",
                  title: "Relatório Completo (Ambos os Mapas)",
                  desc: "Pág 1: Métricas & Clima · Pág 2: Uso do Solo (10m) · Pág 3: Escoamento (CN)",
                },
                {
                  id: "lulc",
                  title: "Mapa de Uso e Cobertura do Solo",
                  desc: "Layout cartográfico com ESA WorldCover 10m, rede hidrográfica e legenda de classes.",
                },
                {
                  id: "cn",
                  title: "Mapa de Escoamento Superficial (CN)",
                  desc: "Layout cartográfico com Curve Number SCS, rede hidrográfica e zonas de infiltração.",
                },
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setPdfExportType(opt.id as any)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    pdfExportType === opt.id
                      ? "bg-blue-50 dark:bg-blue-600/15 border-blue-500 text-blue-900 dark:text-white shadow-sm"
                      : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{opt.title}</span>
                    {pdfExportType === opt.id && <Check size={14} className="text-blue-500 dark:text-blue-400" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{opt.desc}</p>
                </div>
              ))}

              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-3 text-[11px] text-slate-600 dark:text-slate-400 space-y-1 mt-3">
                <div className="font-semibold text-slate-700 dark:text-slate-300">Elementos Cartográficos Incluídos:</div>
                <div className="flex flex-wrap gap-2 text-[10px] text-cyan-600 dark:text-cyan-300 pt-1">
                  <span className="bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 flex items-center gap-1"><Compass size={11} /> Rosa dos Ventos</span>
                  <span className="bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 flex items-center gap-1"><Ruler size={11} /> Barra de Escala Gráfica</span>
                  <span className="bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 flex items-center gap-1"><Globe size={11} /> Graticule Lat/Lon</span>
                  <span className="bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800/60 flex items-center gap-1"><FileText size={11} /> Legenda Temática</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPdfExportModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => generateBasinReportPdf(pdfExportType)}
                disabled={exportingPdf}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/25"
              >
                {exportingPdf ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> A gerar PDF QGIS…
                  </>
                ) : (
                  <>
                    <FileDown size={14} /> Gerar PDF A4
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Análises Guardadas (Arquivo Permanente) ──────────────── */}
      {savedModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600/15 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
                  <FolderOpen size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Arquivo Permanente de Análises</h3>
                  <p className="text-[11px] text-slate-400">Bacias guardadas para consulta instantânea sem recorrer ao GEE</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSavedModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs p-1"
              >
                <X size={14} />
              </button>
            </div>

            <div className="my-4 overflow-y-auto flex-1 space-y-2.5 pr-1 text-xs">
              {savedAnalyses.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Bookmark size={32} className="mx-auto text-slate-300 dark:text-slate-700 opacity-60" />
                  <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhuma análise guardada ainda</p>
                  <p className="text-[11px] max-w-xs mx-auto text-slate-400">
                    Delimite uma bacia e clique em <strong>"Guardar no Arquivo Permanente"</strong> para preservá-la aqui para sempre.
                  </p>
                </div>
              ) : (
                savedAnalyses.map((item) => {
                  const area = item.metadata?.areaKm2 || item.data?.basinReport?.morphometry?.areaKm2 || 0;
                  const date = item.saved_at
                    ? new Date(item.saved_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "—";
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 hover:border-blue-400 dark:hover:border-blue-500 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">{item.title}</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Guardada em {date} · {area > 0 ? `${area.toLocaleString("pt-PT")} km²` : "Área Delimitada"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedAnalysis(item.id)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded-lg transition-colors"
                          title="Eliminar do arquivo"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleLoadSavedAnalysis(item)}
                          disabled={loadingSaved}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] flex items-center justify-center gap-1 transition-all shadow-sm"
                        >
                          <Crosshair size={11} /> Carregar no Mapa
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (item.data) {
                              downloadStandaloneBasinHtml({
                                title: item.title,
                                basinReport: item.data.basinReport,
                                watershedData: item.data.watershedData,
                                wsStats: item.data.wsStats,
                                pourPoint: item.data.pourPoint,
                                province: item.data.province,
                                district: item.data.district,
                              });
                            }
                          }}
                          className="py-1.5 px-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium text-[11px] flex items-center gap-1 transition-all"
                          title="Descarregar ficheiro HTML autónomo offline"
                        >
                          <FileCode size={11} /> HTML
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSavedModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * HidroGeoMoz — Módulo de Análise de Bacias Hidrográficas
 *
 * Modo "Explorar Bacias": HydroBASINS clicáveis + stats GEE (painel direito).
 * Modo "Delimitar Bacia": clique no mapa → watershed D8 via DEM HydroSHEDS (painel direito).
 * Rede de Linhas de Água: multi-ordem (aprox. Strahler 1–5).
 * Sidebar esquerda recolhível.
 */

import { useState, useCallback, useRef } from "react";
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
  Mountain, Ruler, Gauge, ArrowDownCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useProvinceNames, useDistrictNames, useStats } from "@/hooks/useGeoMoz";
import { apiUrl } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";

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
          <span className="text-[11px] text-slate-500">{label}</span>
          <span className="text-[11px] font-bold" style={{ color }}>{riskLabel(eff)} · {value.toFixed(0)}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, unit = "" }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-800 font-mono">
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
  province: string | null; district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
}

export default function HidroGeoMoz({ province, district, onProvinceChange, onDistrictChange }: Props) {
  const { toast } = useToast();
  const mapRef = useRef<LMap | null>(null);

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  const [pourPoint,     setPourPoint]     = useState<[number, number] | null>(null);
  const [watershedData, setWatershedData] = useState<WatershedResult | null>(null);
  const [maxIter]                         = useState(60);   // D8 fallback only
  const [level,         setLevel]         = useState(10);
  const [loadingWS,     setLoadingWS]     = useState(false);
  const [wsStats,       setWsStats]       = useState<BasinStats | null>(null);
  const [loadingWsSt,   setLoadingWsSt]   = useState(false);

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
  const [geeStatus,     setGeeStatus]     = useState<{ connected: boolean } | null>(null);
  const [loadingBasins, setLoadingBasins] = useState(false);
  const [loadingStats,  setLoadingStats]  = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // GeoMoz data
  const { data: provinceNames   } = useProvinceNames();
  const { data: districtNames   } = useDistrictNames(province);
  const { data: statsData       } = useStats(province, district);

  // GEE check
  const checkGEE = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/geomoz-api/gee/status"));
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
        fetch(apiUrl("/geomoz-api/gee/basins"), { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ province, district, level: basinLevel }) }),
        showDrainage
          ? fetch(apiUrl("/geomoz-api/gee/drainage"), { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ province, district, threshold: drainThresh }) })
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
      const r = await fetch(apiUrl("/geomoz-api/gee/basin-stats"), { method: "POST",
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
      const r = await fetch(apiUrl("/geomoz-api/gee/river-network"), { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ province, district }) });
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

  // Watershed delineation
  async function onMapClick(lat: number, lng: number) {
    if (mode !== "delineate") return;
    setError(null); setPourPoint([lat, lng]); setWatershedData(null); setWsStats(null);
    setBasinReport(null); setReportLayer("none"); setLoadingWS(true);
    const ok = await checkGEE();
    if (!ok) { setLoadingWS(false); return; }
    // Hard timeout so the UI never hangs forever on a slow GEE response.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const r = await fetch(apiUrl("/geomoz-api/gee/watershed"), { method: "POST",
        headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ lat, lon: lng, province, district, max_iter: maxIter, level }) });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      const wd: WatershedResult = await r.json();
      setWatershedData(wd);
      setLoadingWS(false);   // show the basin immediately; stats load separately
      // Auto-stats for delineated watershed
      if (wd.geojson?.features?.length) {
        setLoadingWsSt(true);
        try {
          const sr = await fetch(apiUrl("/geomoz-api/gee/basin-stats"), { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geometry: wd.geojson.features[0]?.geometry ?? wd.geojson }) });
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

  // Generate the full hydro-environmental report for the delineated basin
  async function runBasinReport() {
    const geom = watershedData?.geojson?.features?.[0]?.geometry;
    if (!geom) return;
    setLoadingReport(true); setError(null);
    try {
      const r = await fetch(apiUrl("/geomoz-api/gee/basin-report"), { method: "POST",
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
    : (selectedFeat !== null || statsData !== null || loadingStats);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Sidebar Toggle (always visible) ─────────────────────────────── */}
      <button
        onClick={() => setSidebarOpen(o => !o)}
        className="z-[700] absolute left-0 top-1/2 -translate-y-1/2 w-5 h-16 bg-white border border-l-0 border-slate-200 rounded-r-lg flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
        style={{ left: sidebarOpen ? "17rem" : 0 }}
        title={sidebarOpen ? "Recolher" : "Expandir"}
      >
        {sidebarOpen ? <ChevronLeft size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
      </button>

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-slate-200 overflow-y-auto shrink-0 transition-all duration-200 ${sidebarOpen ? "w-68" : "w-0 overflow-hidden"}`}
        style={{ width: sidebarOpen ? "272px" : "0px" }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm shrink-0">
              <Droplets size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Bacias Hidrográficas</h2>
              <p className="text-[10px] text-slate-400">HydroSHEDS · GEE · DEM GLO-30</p>
            </div>
          </div>
          {geeStatus && (
            <div className={`mt-2 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg ${geeStatus.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {geeStatus.connected ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
              {geeStatus.connected ? "GEE conectado" : "GEE offline"}
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="p-3 border-b border-slate-100">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1">
            {([["delineate","Delimitar",Crosshair],["explore","Explorar",Layers]] as const).map(([m, label, Icon]) => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all ${mode === m ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Área de estudo */}
        <div className="p-3 space-y-2.5 border-b border-slate-100">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Área de Estudo</h4>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Província</label>
            <div className="relative">
              <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={province ?? ""} onChange={e => { onProvinceChange(e.target.value || null); onDistrictChange(null); }}>
                <option value="">Moçambique (todo)</option>
                {provinceNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {province && (
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Distrito</label>
              <div className="relative">
                <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={district ?? ""} onChange={e => onDistrictChange(e.target.value || null)}>
                  <option value="">Toda a província</option>
                  {districtNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Explore config */}
        {mode === "explore" && (
          <div className="p-3 space-y-3 border-b border-slate-100">
            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Configuração</h4>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-700 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
              <span>As bacias pré-definidas (HydroBASINS) podem não estar disponíveis neste projeto. Se nada aparecer, use <strong>Delimitar</strong> para delinear por DEM.</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">HydroBASINS — <strong className="text-slate-700">Nível {basinLevel}</strong></label>
              <input type="range" min={5} max={8} step={1} value={basinLevel} onChange={e => setBasinLevel(+e.target.value)} className="w-full accent-blue-500" />
              <div className="flex justify-between text-[10px] text-slate-400"><span>Grandes (5)</span><span>Detalhe (8)</span></div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-500">Rede de Drenagem</label>
              <input type="checkbox" checked={showDrainage} onChange={e => setShowDrainage(e.target.checked)} className="accent-blue-500" />
            </div>
            {showDrainage && (
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Limiar acumulação</label>
                <input type="range" min={100} max={2000} step={100} value={drainThresh} onChange={e => setDrainThresh(+e.target.value)} className="w-full accent-cyan-500" />
                <div className="flex justify-between text-[10px] text-slate-400"><span>Cabeceiras</span><span>Rios principales</span></div>
              </div>
            )}
            <button onClick={loadBasins} disabled={loadingBasins}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
              {loadingBasins ? <><Loader2 size={12} className="animate-spin" /> A carregar…</> : <><Play size={12} /> Carregar Bacias</>}
            </button>
          </div>
        )}

        {/* Delineate config */}
        {mode === "delineate" && (
          <div className="p-3 space-y-3 border-b border-slate-100">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-800 flex items-start gap-2">
              <MapPin size={12} className="mt-0.5 shrink-0 text-blue-500" />
              <span>Clique no mapa: devolve a <strong>sub-bacia HydroBASINS</strong> que contém o ponto (limite real, instantâneo).</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Detalhe — <strong className="text-slate-700">nível {level}</strong></label>
              <input type="range" min={6} max={12} step={1} value={level} onChange={e => setLevel(+e.target.value)} className="w-full accent-blue-500" />
              <div className="flex justify-between text-[10px] text-slate-400"><span>Grande (6)</span><span>Pequena (12)</span></div>
            </div>
            {pourPoint && (
              <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] font-mono text-slate-600 space-y-0.5">
                <div className="text-[10px] font-semibold text-slate-400 not-italic mb-1">Ponto seleccionado</div>
                <div>Lat {pourPoint[0].toFixed(5)} · Lon {pourPoint[1].toFixed(5)}</div>
                {watershedData && <div className="text-blue-700 font-bold not-italic">{watershedData.areaKm2.toLocaleString("pt-PT")} km²</div>}
              </div>
            )}
          </div>
        )}

        {/* River network */}
        <div className="p-3 space-y-2.5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><GitBranch size={10} /> Linhas de Água</h4>
            {riverNet && <input type="checkbox" checked={showRiverNet} onChange={e => setShowRiverNet(e.target.checked)} className="accent-blue-500" />}
          </div>
          {riverNet && showRiverNet && (
            <div className="flex items-center gap-1.5">
              <input type="checkbox" checked={showAllOrders} onChange={e => setShowAllOrders(e.target.checked)} className="accent-cyan-500" />
              <span className="text-[10px] text-slate-600">Todas as ordens</span>
            </div>
          )}
          <button onClick={loadRiverNetwork} disabled={loadingRN}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl transition-colors">
            {loadingRN ? <><Loader2 size={11} className="animate-spin" /> A gerar…</> : <><RefreshCw size={11} /> {riverNet ? "Atualizar" : "Gerar Linhas de Água"}</>}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="m-3 bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] text-red-700 flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* Hint */}
        {mode === "explore" && !selectedFeat && basinsData?.source === "hydrobasins" && (
          <div className="m-3 bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-[11px] text-blue-700 flex items-start gap-1.5">
            <Info size={11} className="mt-0.5 shrink-0" />Clique numa bacia no mapa para ver estatísticas detalhadas no painel direito.
          </div>
        )}
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <div className={`flex-1 relative overflow-hidden ${mode === "delineate" ? "cursor-crosshair" : ""}`}>
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} ref={mapRef} zoomControl={false}>
          <ZoomControl position="topright" />
          <MapTools />
          <ScaleControl position="bottomright" imperial={false} />
          <MapClickHandler onMapClick={onMapClick} active={mode === "delineate"} />

          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a>' maxZoom={19} />

          <AreaSelect
            province={province} district={district}
            onProvinceChange={p => { onProvinceChange(p); onDistrictChange(null); }}
            onDistrictChange={onDistrictChange}
            selectable={mode === "explore"}
          />

          {/* River network */}
          {showRiverNet && riverNet && (
            <TileLayer key={`rn-${showAllOrders}-${riverNet.tileUrl}`}
              url={showAllOrders ? riverNet.tileUrl : riverNet.majorTileUrl}
              attribution="HydroSHEDS · WWF" opacity={showAllOrders ? 0.75 : 0.9} maxZoom={18} />
          )}

          {/* Drainage (explore, no river net) */}
          {mode === "explore" && showDrainage && drainageTile && !showRiverNet && (
            <TileLayer key={`drain-${drainageTile.tileUrl}`} url={drainageTile.tileUrl}
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
              <TileLayer key={`wst-${watershedData.tileUrl}`} url={watershedData.tileUrl} opacity={0.3} maxZoom={18} />
            </>
          )}

          {/* Basin report overlays (toggleable): land cover / SCS-CN runoff */}
          {basinReport && reportLayer === "lulc" && (
            <TileLayer key={`rep-lulc-${basinReport.landcoverTile}`} url={basinReport.landcoverTile}
              attribution="GEE · ESA WorldCover 2021" opacity={0.75} maxZoom={18} />
          )}
          {basinReport && reportLayer === "cn" && (
            <TileLayer key={`rep-cn-${basinReport.runoff.cnTile}`} url={basinReport.runoff.cnTile}
              attribution="GEE · SCS Curve Number" opacity={0.7} maxZoom={18} />
          )}

          {/* Pour point marker */}
          {pourPoint && (
            <CircleMarker center={pourPoint} radius={9}
              pathOptions={{ fillColor: "#ef4444", color: "#ffffff", weight: 3, fillOpacity: 1 }} />
          )}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-blue-100 p-3 pointer-events-none text-[11px] min-w-[130px]">
          {mode === "explore" ? (
            <>
              <div className="font-semibold text-blue-800 mb-2 flex items-center gap-1"><Droplets size={11} /> HydroBASINS</div>
              <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-5 h-1.5 rounded border border-blue-500 bg-blue-500/10" /><span className="text-slate-600">Bacia</span></div>
              <div className="flex items-center gap-1.5"><span className="inline-block w-5 h-1.5 rounded border border-amber-400 bg-amber-400/25" /><span className="text-slate-600">Seleccionada</span></div>
            </>
          ) : (
            <>
              <div className="font-semibold text-blue-800 mb-2 flex items-center gap-1"><Crosshair size={11} /> Sub-bacia</div>
              <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm" /><span className="text-slate-600">Ponto clicado</span></div>
              <div className="flex items-center gap-1.5"><span className="inline-block w-5 h-1.5 rounded border-2 border-blue-800 bg-blue-600/20" /><span className="text-slate-600">Bacia delimitada</span></div>
            </>
          )}
          {showRiverNet && riverNet && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="font-semibold text-cyan-800 mb-1 flex items-center gap-1"><GitBranch size={10} /> Linhas de Água</div>
              {showAllOrders ? (
                ["#a8d5f7","#5badf5","#1a73e8","#0d47a1","#002171"].map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-block w-5 h-1 rounded" style={{ background: c }} />
                    <span className="text-slate-500 text-[10px]">{["Cabeceiras","Pequenos","Médios","Grandes","Principais"][i]}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5"><span className="inline-block w-5 h-1 rounded bg-[#002171]" /><span className="text-slate-500">Rios principais</span></div>
              )}
            </div>
          )}
        </div>

        {/* Top banner (delineate mode) */}
        {mode === "delineate" && !pourPoint && !loadingWS && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-blue-700/90 backdrop-blur text-white rounded-full px-4 py-2 text-xs font-medium flex items-center gap-2 shadow-lg pointer-events-none">
            <Crosshair size={13} /> Clique no mapa para definir o ponto de saída da bacia
          </div>
        )}
        {mode === "explore" && basinsData?.source === "hydrobasins" && (
          <div className="absolute top-4 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-sm border border-blue-100 px-3 py-1.5 text-[11px] text-blue-700 flex items-center gap-1.5 pointer-events-none">
            <Layers size={11} />{basinsData.count} bacias · Nível {basinsData.level}
          </div>
        )}

        {/* Loading overlay */}
        {(loadingBasins || loadingWS || loadingRN) && (
          <div className="absolute inset-0 z-[600] bg-white/55 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 px-7 py-5 flex items-center gap-3">
              <Loader2 size={20} className="text-blue-500 animate-spin" />
              <span className="text-sm text-slate-700 font-medium">
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
        <div className="w-80 flex flex-col bg-white border-l border-slate-200 overflow-y-auto shrink-0">

          {/* ── DELINEATE mode right panel ───────────────────────────────── */}
          {mode === "delineate" && (
            <>
              {/* Watershed header */}
              <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownCircle size={15} className="text-blue-600" />
                  <span className="text-sm font-semibold text-slate-900">Bacia Delimitada</span>
                </div>
                {pourPoint && (
                  <div className="text-[11px] text-slate-500 font-mono">
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
                    <div className="mt-2 text-xs opacity-70">{watershedData.source === "hydrobasins" ? `HydroBASINS · nível ${watershedData.level ?? level}` : "D8 · HydroSHEDS"}</div>
                  </div>

                  {/* Stats loading (separate from basin delineation) */}
                  {loadingWsSt && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 rounded-xl p-3">
                      <Loader2 size={13} className="animate-spin text-blue-400" /> A calcular estatísticas GEE (declive, NDVI, chuva)…
                    </div>
                  )}

                  {/* Morphometry */}
                  {wsStats && !loadingWsSt && (
                    <>
                      <div>
                        <SectionHeader title="Morfometria" icon={Mountain} />
                        <div className="bg-slate-50 rounded-xl p-3 space-y-0">
                          <StatRow label="Elev. mínima" value={wsStats.elevMinM.toFixed(0)} unit=" m" />
                          <StatRow label="Elev. média" value={wsStats.elevMeanM.toFixed(0)} unit=" m" />
                          <StatRow label="Elev. máxima" value={wsStats.elevMaxM.toFixed(0)} unit=" m" />
                          <StatRow label="Declive médio" value={wsStats.slopeMeanDeg.toFixed(1)} unit="°" />
                        </div>
                      </div>

                      <div>
                        <SectionHeader title="Vegetação & Clima" icon={Activity} />
                        <div className="bg-slate-50 rounded-xl p-3 space-y-0">
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
                        className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold rounded-xl transition-colors">
                        <FileText size={12} /> GeoJSON
                      </button>
                      {wsStats && (
                        <button
                          onClick={() => exportCSV(wsStats, `watershed_${pourPoint?.[0].toFixed(3)}`)}
                          className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
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
                            <div key={k} className="bg-slate-50 rounded-lg p-2 text-center">
                              <div className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight">{k}</div>
                              <div className="text-xs font-bold text-slate-700">{v}</div>
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Uso do Solo</div>
                          <div className="space-y-1">
                            {basinReport.landcover.slice(0, 6).map(c => (
                              <div key={c.code} className="flex items-center gap-2 text-[11px]">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                                <span className="text-slate-600 flex-1 truncate">{c.label}</span>
                                <span className="text-slate-400 font-mono">{c.pct}%</span>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => setReportLayer(l => l === "lulc" ? "none" : "lulc")}
                            className={`mt-1.5 w-full text-[10px] py-1 rounded-lg border transition-colors ${reportLayer === "lulc" ? "bg-lime-100 border-lime-300 text-lime-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
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

                        <div className="bg-slate-50 rounded-xl p-2.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-slate-600">Escoamento — CN médio</div>
                            <div className="text-sm font-bold text-slate-800">{basinReport.runoff.cnMean ?? "—"}</div>
                          </div>
                          <div className="h-2 rounded-full mt-1.5" style={{ background: "linear-gradient(to right,#1a9850,#fee08b,#d73027)" }} />
                          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>40 · infiltra</span><span>escoa · 100</span></div>
                          <button onClick={() => setReportLayer(l => l === "cn" ? "none" : "cn")}
                            className={`mt-1.5 w-full text-[10px] py-1 rounded-lg border transition-colors ${reportLayer === "cn" ? "bg-red-100 border-red-300 text-red-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                            {reportLayer === "cn" ? "Ocultar no mapa" : "Ver mapa de escoamento"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    Sub-bacia HydroBASINS (limite oficial WWF/HydroSHEDS). Para análise definitiva, recomenda-se validação de campo.
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
              <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <BarChart2 size={14} className="text-blue-500" />
                  <span className="text-sm font-semibold text-slate-900">
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
                        <div className="bg-slate-50 rounded-xl p-3 space-y-0 mb-3">
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
                              className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
                              <Download size={11} /> CSV Stats
                            </button>
                            {selectedFeat && (
                              <button onClick={() => exportGeoJSON(selectedFeat as GeoJSON.Feature, `bacia_${selectedFeat.properties?.HYBAS_ID ?? "sel"}`)}
                                className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold rounded-xl transition-colors">
                                <FileText size={11} /> GeoJSON
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4" />
                      </>
                    )}
                  </div>
                )}

                {/* Geology charts */}
                {lithoData.length > 0 && (
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

                {/* Geology table */}
                {statsData && (
                  <div>
                    <SectionHeader title="Unidades Geológicas" icon={Layers} />
                    <div className="bg-slate-50 rounded-xl overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="text-left p-2 text-slate-500 font-medium">Litologia</th>
                            <th className="text-right p-2 text-slate-500 font-medium">km²</th>
                            <th className="text-right p-2 text-slate-500 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsData.lithologies.slice(0, 8).map((l, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="p-2 text-slate-700 truncate max-w-[110px]" title={l.name}>{l.name}</td>
                              <td className="p-2 text-right text-slate-600 font-mono">{l.areaKm2.toFixed(0)}</td>
                              <td className="p-2 text-right text-slate-600 font-mono">{l.percent.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {statsData.dominant && (
                      <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                        <Info size={9} /> Dominante: <strong className="text-slate-600 ml-0.5">{statsData.dominant}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!selectedFeat && !statsData && (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
                    <Globe size={24} className="text-slate-300" />
                    <span className="text-sm text-center">Selecione uma área ou carregue as bacias para ver análise geocientífica.</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

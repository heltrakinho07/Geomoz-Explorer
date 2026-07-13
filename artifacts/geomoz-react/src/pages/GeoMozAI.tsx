/**
 * GeoMoz AI — Geological Machine Learning Module.
 *
 * Implemented features:
 *  - K-Means geological clustering (pure TS, runs in browser)
 *  - PCA 2-component projection (visualization)
 *  - Mineral favorability scoring (knowledge-based, extensible)
 *  - Multi-mineral favorability maps
 *  - Province ranking tables
 *  - AlphaEarth Foundations integration: embedding PCA, K-Means,
 *    similarity search, change detection, supervised classification
 *    on 64-d satellite embeddings
 *
 * Architecture ready for:
 *  - WebWorker offloading (heavy ML runs)
 *  - Random Forest / XGBoost (via ONNX Runtime Web)
 *  - Server-side scikit-learn inference via API
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  MapContainer, TileLayer, GeoJSON, ScaleControl, useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  BrainCircuit, GitBranch, Map, BarChart2, Loader2, Info,
  ChevronDown, Play, Target, Star, TrendingUp, Cpu,
  Satellite, Layers, Crosshair, Calendar, Settings2,
  Plus, Trash2, Check, X,
  Palette, Search, Award, Gem, CircleDot, Square,
  Wrench, Flame, Mountain,
} from "lucide-react";

import { useProvinceSummary, useProvincesGeoJSON, ProvinceSummaryItem } from "@/hooks/useGeoMoz";
import {
  runKMeansInWorker, normalize, pca2, scoreFavorability,
  lithologyProfile,
  FavorabilityResult, MineralType, KMeansResult,
} from "@/lib/geoml";
import { API_BASE } from "@/lib/api";
import MapTools from "@/components/MapTools";
import MapDraw from "@/components/MapDraw";

function buildProvinceFeatures(p: ProvinceSummaryItem): number[] {
  const prof = lithologyProfile(p.lithologies, p.eras, p.periods);
  const logArea = Math.log10(Math.max(1, p.totalAreaKm2)) / 6;
  return [
    prof.metamorphic, prof.felsicIgneous, prof.maficIgneous,
    prof.sedimentary, prof.quaternary, prof.volcanic,
    logArea * 0.3,
  ];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  "#0ea5e9","#8b5cf6","#f59e0b","#10b981","#ef4444",
  "#06b6d4","#ec4899","#84cc16","#f97316","#6366f1",
];

const FAVORABILITY_GRADIENT = (t: number): string => {
  const r = Math.round(255 * Math.min(1, t * 2));
  const g = Math.round(255 * Math.min(1, (1 - t) * 2));
  return `rgb(${r},${g},0)`;
};

const MINERAL_OPTIONS: { value: MineralType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "gold",           label: "Ouro (Au)",            icon: <Award size={20} className="text-amber-500" />, desc: "Greenstone belts, BIF, shear zones" },
  { value: "gemstones",      label: "Pedras Preciosas",     icon: <Gem size={20} className="text-pink-500" />, desc: "Mármore, calc-silicato, pegmatito" },
  { value: "coal",           label: "Carvão (Coke)",        icon: <CircleDot size={20} className="text-slate-700" />, desc: "Karoo/Gondwana permo-carbonífero" },
  { value: "graphite",       label: "Grafite",              icon: <Square size={20} className="text-slate-500" />, desc: "Gneisse Pré-câmbrico, xisto, granulito" },
  { value: "heavy_minerals", label: "Minerais Pesados",     icon: <Mountain size={20} className="text-amber-700" />, desc: "Aluvião quaternário, depósitos costeiros" },
  { value: "base_metals",    label: "Metais Base (Cu/Ni)",  icon: <Wrench size={20} className="text-cyan-600" />, desc: "Máficas/ultramáficas, ofiolitos" },
  { value: "hydrocarbons",   label: "Hidrocarbonetos",      icon: <Flame size={20} className="text-orange-500" />, desc: "Bacias mesozoicas, calcário, evaporite" },
];

type AITab = "clustering" | "favorability" | "pca" | "about" | "alphaearth";

type AlphaEarthMode = "pca" | "cluster" | "change" | "similarity" | "classify";

interface TrainingSample {
  id: number;
  classId: number;
  className: string;
  geojson: GeoJSON.Feature;
  color: string;
}

const CLASS_PRESETS = [
  { id: 1, name: "Floresta", color: "#22c55e" },
  { id: 2, name: "Agricultura", color: "#eab308" },
  { id: 3, name: "Urbano", color: "#ef4444" },
  { id: 4, name: "Água", color: "#3b82f6" },
  { id: 5, name: "Solo Nu", color: "#a16207" },
  { id: 6, name: "Rocha", color: "#78716c" },
  { id: 7, name: "Mangal", color: "#0d9488" },
  { id: 8, name: "Zona Húmida", color: "#06b6d4" },
  { id: 9, name: "Pastagem", color: "#84cc16" },
  { id: 10, name: "Outro", color: "#8b5cf6" },
];

function getColorForClass(classId: number): string {
  return CLASS_PRESETS.find(p => p.id === classId)?.color ?? "#8b5cf6";
}

// ── Helper: province name from GeoJSON feature ─────────────────────────────────

function getProvinceName(feature: GeoJSON.Feature): string {
  const p = feature.properties as Record<string, string>;
  return p?.Provincia || p?.PROVINCIA || p?.NAME_1 || p?.name || "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// AlphaEarth Foundations Tab
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TrainingBoundsFitter — Auto-zoom to the most recently added training polygon.
 * Renders as a child of <MapContainer> so it can use useMap().
 */
function TrainingBoundsFitter({ trainingSamples }: { trainingSamples: TrainingSample[] }) {
  const map = useMap();

  useEffect(() => {
    if (trainingSamples.length === 0) return;
    // Get the last added sample (new polygon)
    const last = trainingSamples[trainingSamples.length - 1];
    const geometry = last.geojson.geometry;
    if (!geometry) return;

    // Extract all coordinates from the geometry
    // GeoJSON Polygon: coordinates[0] = [[lng, lat], [lng, lat], ...]
    // GeoJSON MultiPolygon: coordinates[0][0] = [[lng, lat], ...]
    let coords: Array<[number, number]> = [];
    if (geometry.type === "Polygon") {
      coords = (geometry as GeoJSON.Polygon).coordinates[0].map(c => [c[1], c[0]] as [number, number]);
    } else if (geometry.type === "MultiPolygon") {
      const polys = (geometry as GeoJSON.MultiPolygon).coordinates;
      polys.forEach(poly => {
        poly[0].forEach(c => coords.push([c[1], c[0]]));
      });
    } else if (geometry.type === "LineString") {
      coords = (geometry as GeoJSON.LineString).coordinates.map(c => [c[1], c[0]] as [number, number]);
    }

    if (coords.length < 2) return;

    // Compute bounds from coordinates
    const lats = coords.map(c => c[0]);
    const lngs = coords.map(c => c[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Add padding proportional to the polygon size
    const latPad = Math.max(0.005, (maxLat - minLat) * 0.3);
    const lngPad = Math.max(0.005, (maxLng - minLng) * 0.3);

    const bounds: [[number, number], [number, number]] = [
      [minLat - latPad, minLng - lngPad],
      [maxLat + latPad, maxLng + lngPad],
    ];

    map.fitBounds(bounds, { maxZoom: 15 });
  }, [trainingSamples.length, map]);

  return null;
}

const AE_BASE = `${API_BASE}/geomoz-api/gee/embedding`;

interface AlphaEarthResult {
  tileUrl: string;
  name: string;
  description?: string;
  year?: number;
  [key: string]: unknown;
}

function AlphaEarthTab() {
  const [mode, setMode] = useState<AlphaEarthMode>("pca");
  const [year, setYear] = useState(2024);
  const [yearBefore, setYearBefore] = useState(2020);
  const [nClusters, setNClusters] = useState(6);
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [result, setResult] = useState<AlphaEarthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: provinceGeoJSON } = useProvincesGeoJSON();

  // ── Training data state (classify mode) ─────────────────────────────────
  const [trainingSamples, setTrainingSamples] = useState<TrainingSample[]>([]);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [pendingDraw, setPendingDraw] = useState<GeoJSON.GeoJSON | null>(null);
  const [showClassForm, setShowClassForm] = useState(false);
  const [newClassId, setNewClassId] = useState(1);
  const [nextSampleId, setNextSampleId] = useState(1);
  const [classifyResult, setClassifyResult] = useState<AlphaEarthResult | null>(null);

  const handleDrawComplete = useCallback((geometry: GeoJSON.GeoJSON, _label: string) => {
    setPendingDraw(geometry);
    setDrawingEnabled(false);
    setShowClassForm(true);
  }, []);

  function addTrainingSample() {
    if (!pendingDraw) return;
    const preset = CLASS_PRESETS.find(p => p.id === newClassId);
    const sample: TrainingSample = {
      id: nextSampleId,
      classId: newClassId,
      className: preset?.name ?? `Classe ${newClassId}`,
      geojson: {
        type: "Feature",
        geometry: pendingDraw as GeoJSON.Geometry,
        properties: { class: newClassId },
      },
      color: getColorForClass(newClassId),
    };
    setTrainingSamples(prev => [...prev, sample]);
    setNextSampleId(prev => prev + 1);
    setPendingDraw(null);
    setShowClassForm(false);
    setNewClassId(1);
  }

  function removeTrainingSample(id: number) {
    setTrainingSamples(prev => prev.filter(s => s.id !== id));
  }

  function clearAllSamples() {
    setTrainingSamples([]);
    setPendingDraw(null);
    setShowClassForm(false);
    setClassifyResult(null);
  }

  const trainingGeoJSON = useMemo((): GeoJSON.FeatureCollection | null => {
    if (trainingSamples.length === 0) return null;
    return {
      type: "FeatureCollection",
      features: trainingSamples.map(s => s.geojson),
    };
  }, [trainingSamples]);

  // Province list from GeoJSON
  const provinceNames = useMemo(() => {
    if (!provinceGeoJSON) return [];
    return provinceGeoJSON.features
      .map(f => getProvinceName(f))
      .filter(Boolean)
      .sort();
  }, [provinceGeoJSON]);

  // Fetch district names when province changes
  const [districtNames, setDistrictNames] = useState<string[]>([]);
  const fetchDistricts = useCallback(async (prov: string) => {
    if (!prov) { setDistrictNames([]); return; }
    try {
      const res = await fetch(
        `${API_BASE}/geomoz-api/district-names?province=${encodeURIComponent(prov)}`
      );
      const data = await res.json();
      setDistrictNames(data.names || []);
    } catch { setDistrictNames([]); }
  }, []);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setClassifyResult(null);
    try {
      const params = new URLSearchParams();
      if (province) params.set("province", province);
      if (district) params.set("district", district);

      let url = "";
      const body: Record<string, unknown> = {};

      switch (mode) {
        case "pca":
          url = `${AE_BASE}?${params}`;
          body.year = year;
          break;
        case "cluster":
          url = `${AE_BASE}/cluster?${params}`;
          body.year = year;
          body.n_clusters = nClusters;
          break;
        case "classify":
          url = `${AE_BASE}/classify?${params}`;
          body.year = year;
          body.training = trainingGeoJSON || { type: "FeatureCollection", features: [] };
          break;
        case "change":
          url = `${AE_BASE}/change?${params}`;
          body.year_before = yearBefore;
          body.year_after = year;
          break;
        case "similarity":
          url = `${AE_BASE}/similarity?${params}`;
          body.year = year;
          body.reference_lon = 35;
          body.reference_lat = -18.5;
          break;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as Record<string, unknown>).detail as string || `Erro ${res.status}`);
      }

      const data = (await res.json()) as AlphaEarthResult;
      if (mode === "classify") {
        setClassifyResult(data);
      } else {
        setResult(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [mode, year, yearBefore, nClusters, province, district, trainingGeoJSON]);

  const tileKey = `ae-${mode}-${year}-${result?.tileUrl?.slice(-20) ?? classifyResult?.tileUrl?.slice(-20) ?? "empty"}`;

  const r = (result ?? classifyResult) as Record<string, unknown> | null;
  const clusters = r && "clusters" in r ? r.clusters as Array<Record<string, unknown>> : null;
  const classes = r && "classes" in r ? r.classes as Array<Record<string, unknown>> : null;
  const totalKm2 = r && "totalKm2" in r ? r.totalKm2 as number : null;
  const meanChange = r && "meanChange" in r ? r.meanChange as number : null;
  const highChangeKm2 = r && "highChangeKm2" in r ? r.highChangeKm2 as number : null;
  const highAreaKm2 = r && "highAreaKm2" in r ? r.highAreaKm2 as number : null;
  const nTrain = r && "nTrain" in r ? r.nTrain as number : null;
  const aePalette = r && "palette" in r ? r.palette : null;
  const showPalette = !!aePalette && Array.isArray(aePalette) && (aePalette as unknown[]).length > 0;

  const activeTileUrl = result?.tileUrl ?? classifyResult?.tileUrl;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Controls sidebar */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        {/* Mode selector */}
        <div className="p-4 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            <Satellite size={12} className="inline mr-1" /> Modo de Análise
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: "pca" as const, label: "PCA (RGB)", icon: <Palette size={14} className="text-emerald-600" /> },
              { id: "cluster" as const, label: "K-Means", icon: <Cpu size={14} className="text-emerald-600" /> },
              { id: "classify" as const, label: "Classificar", icon: <Crosshair size={14} className="text-emerald-600" /> },
              { id: "change" as const, label: "Change Det.", icon: <Satellite size={14} className="text-emerald-600" /> },
              { id: "similarity" as const, label: "Similaridade", icon: <Search size={14} className="text-emerald-600" /> },
            ]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  mode === opt.id
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                    : "bg-slate-50 border border-slate-100 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            <Settings2 size={12} className="inline mr-1" /> Parâmetros
          </h4>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Província</label>
            <select value={province} onChange={e => { setProvince(e.target.value); setDistrict(""); fetchDistricts(e.target.value); }}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 outline-none">
              <option value="">Moçambique (completo)</option>
              {provinceNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Distrito</label>
            <select value={district} onChange={e => setDistrict(e.target.value)} disabled={!province}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 outline-none disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">Todos</option>
              {districtNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <Calendar size={11} /> Ano — <strong className="text-slate-700">{mode === "change" ? `${yearBefore} → ${year}` : year}</strong>
            </label>
            {mode === "change" ? (
              <div className="flex gap-2">
                <input type="number" min={2017} max={2024} value={yearBefore} onChange={e => setYearBefore(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-center" />
                <span className="text-xs text-slate-400 self-center">→</span>
                <input type="number" min={2017} max={2024} value={year} onChange={e => setYear(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-center" />
              </div>
            ) : (
              <input type="range" min={2017} max={2024} value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full accent-emerald-500" />
            )}
          </div>

          {mode === "cluster" && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                N° de clusters — <strong className="text-slate-700">{nClusters}</strong>
              </label>
              <input type="range" min={3} max={15} value={nClusters} onChange={e => setNClusters(Number(e.target.value))}
                className="w-full accent-emerald-500" />
            </div>
          )}
        </div>

        {/* ── Training controls (classify mode) ─────────────────────────────── */}
        {mode === "classify" && (
          <div className="border-b border-slate-100">
            <div className="p-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Layers size={12} /> Amostras de Treino
              </h4>
              <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
                Desenhe polígonos no mapa e atribua uma classe (ex: "Floresta" = 1, "Urbano" = 2).<br />
                Mínimo: <strong>2 polígonos</strong> de classes diferentes.
              </p>

              {!drawingEnabled && !showClassForm && (
                <button onClick={() => { setDrawingEnabled(true); setClassifyResult(null); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-fuchsia-500 hover:bg-fuchsia-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm shadow-fuchsia-200">
                  <Plus size={13} /> Adicionar Polígono
                </button>
              )}

              {/* Pending draw — class assignment form */}
              {showClassForm && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <div className="text-[10px] font-semibold text-amber-700">Atribuir Classe ao Polígono</div>
                  <div className="flex flex-wrap gap-1">
                    {CLASS_PRESETS.slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => setNewClassId(p.id)}
                        className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                          newClassId === p.id
                            ? "border-amber-500 bg-amber-100 text-amber-800 font-semibold"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={addTrainingSample}
                      className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-semibold rounded-md transition-colors">
                      <Check size={11} className="inline mr-1" /> Confirmar
                    </button>
                    <button onClick={() => { setPendingDraw(null); setShowClassForm(false); }}
                      className="py-1.5 px-3 text-[10px] text-red-600 hover:bg-red-50 rounded-md transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )}

              {/* Training samples list */}
              {trainingSamples.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto">
                  {trainingSamples.map(s => (
                    <div key={s.id} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg text-[10px]">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-slate-600 flex-1 truncate">{s.className}</span>
                      <span className="text-slate-400">#{s.classId}</span>
                      <button onClick={() => removeTrainingSample(s.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  <button onClick={clearAllSamples}
                    className="w-full py-1 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors">
                    Limpar todas
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Execute button */}
        <div className="p-4">
          <button onClick={execute} disabled={loading || (mode === "classify" && trainingSamples.length < 2)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-emerald-200">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {loading ? "A processar no GEE…" : mode === "classify" ? "Executar Classificação" : "Executar Análise"}
          </button>
          {mode === "classify" && trainingSamples.length < 2 && (
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Desenhe pelo menos 2 polígonos de classes diferentes
            </p>
          )}
        </div>

        {/* Results panel */}
        {error && (
          <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
        )}

        {r && !error && (clusters || classes || meanChange !== null || highAreaKm2 !== null || nTrain != null) && (
          <div className="p-4 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <BarChart2 size={12} className="inline mr-1" /> Resultados
            </h4>

            {nTrain != null && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Amostras treino</span>
                <span className="font-semibold text-slate-800">{nTrain}</span>
              </div>
            )}
            {totalKm2 != null && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Área total</span>
                <span className="font-semibold text-slate-800">{totalKm2.toLocaleString()} km²</span>
              </div>
            )}
            {meanChange != null && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Mudança média</span>
                <span className="font-semibold text-slate-800">{(meanChange * 100).toFixed(1)}%</span>
              </div>
            )}
            {highChangeKm2 != null && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Alta mudança</span>
                <span className="font-semibold text-amber-600">{highChangeKm2.toLocaleString()} km²</span>
              </div>
            )}
            {highAreaKm2 != null && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Alta similaridade</span>
                <span className="font-semibold text-emerald-600">{highAreaKm2.toLocaleString()} km²</span>
              </div>
            )}

            {clusters && clusters.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {(clusters as Array<Record<string, unknown>>).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: (c.color as string) || "#ccc" }} />
                    <div className="flex-1 truncate">
                      <span className="text-slate-700 font-medium">Cluster {i + 1}</span>
                      <span className="text-slate-400 ml-1">{((c.areaKm2 as number) || 0).toLocaleString()} km²</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {classes && classes.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {(classes as Array<Record<string, unknown>>).map((c, i) => {
                  const classId = c.class as number;
                  const preset = CLASS_PRESETS.find(p => p.id === classId);
                  return (
                    <div key={i} className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: (c.color as string) || preset?.color || "#ccc" }} />
                      <div className="flex-1 truncate">
                        <span className="text-slate-700 font-medium">{preset?.name ?? `Classe ${classId}`}</span>
                        <span className="text-slate-400 ml-1">{(c.areaKm2 as number || 0).toLocaleString()} km²</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Info box */}
        <div className="mt-auto p-4 border-t border-slate-100">
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-700 leading-relaxed">
            <strong className="block mb-1"><BrainCircuit size={12} className="inline mr-1" /> AlphaEarth Foundations</strong>
            Modelo fundacional Google DeepMind. Cada pixel de 10 m é representado
            por um vector de 64 dimensões que codifica as condições de superfície.
            {mode === "classify" && (
              <span className="block mt-1">Modo <strong>Classificação</strong>: Random Forest sobre os
              embeddings. Desenhe polígonos de treino e clique em "Executar Classificação".</span>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        {!activeTileUrl && !loading && trainingSamples.length === 0 && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center pointer-events-none">
            <div className="bg-white/95 border border-slate-200 rounded-2xl px-6 py-5 shadow-lg text-center max-w-xs">
              <Satellite size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-600">
                {mode === "classify"
                  ? "Desenhe polígonos no mapa, atribua classes, e clique <strong>Executar Classificação</strong>."
                  : "Seleccione um modo e clique <strong>Executar Análise</strong> para processar os embeddings AlphaEarth no GEE."
                }
              </p>
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center bg-white/50">
            <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-lg text-center">
              <Loader2 size={24} className="text-emerald-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-600">A processar no Google Earth Engine…</p>
              <p className="text-xs text-slate-400 mt-1">Random Forest sobre 64 bandas de embedding</p>
            </div>
          </div>
        )}

        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OSM &copy; CARTO" maxZoom={19} />

          {/* Result tile overlay */}
          {activeTileUrl && (
            <TileLayer key={tileKey} url={activeTileUrl} opacity={0.75} />
          )}

          {/* Training polygons overlay (classify mode) */}
          {trainingGeoJSON && (
            <GeoJSON
              key={`train-${trainingSamples.length}`}
              data={trainingGeoJSON}
              style={(f) => {
                const cid = (f?.properties as Record<string, unknown>)?.class as number;
                return {
                  color: "#ffffff",
                  weight: 2,
                  fillColor: getColorForClass(cid ?? 0),
                  fillOpacity: 0.35,
                };
              }}
              onEachFeature={(f, layer) => {
                const props = f.properties as Record<string, unknown>;
                const cid = props?.class as number;
                const preset = CLASS_PRESETS.find(p => p.id === cid);
                layer.bindTooltip(
                  `<b>${preset?.name ?? `Classe ${cid}`}</b><br/>Classe ID: ${cid}`,
                  { sticky: true }
                );
              }}
            />
          )}

          {provinceGeoJSON && (
            <GeoJSON data={provinceGeoJSON} style={{ color: "#334155", weight: 1.5, fill: false }} />
          )}

          {/* Auto-fit bounds when new training polygon added */}
          {mode === "classify" && trainingSamples.length > 0 && (
            <TrainingBoundsFitter trainingSamples={trainingSamples} />
          )}

          {/* MapDraw component for drawing training polygons */}
          {mode === "classify" && (
            <MapDraw
              enabled={drawingEnabled}
              onDrawComplete={handleDrawComplete}
              onCancel={() => { setDrawingEnabled(false); setPendingDraw(null); }}
            />
          )}

          <ScaleControl position="bottomleft" imperial={false} />
          <MapTools />
        </MapContainer>

        {/* Legend overlay */}
        {(activeTileUrl || trainingSamples.length > 0) && (
          <div className="absolute bottom-6 left-4 z-[500] bg-black/80 backdrop-blur-sm border border-slate-700 rounded-xl shadow-lg p-3 max-w-[220px]">
            <div className="text-xs font-semibold text-emerald-400 mb-1 truncate">
              {(result ?? classifyResult)?.name || (mode === "classify" ? "AlphaEarth — Classes" : "AlphaEarth")}
            </div>
            {showPalette && mode === "similarity" && (
              <div className="space-y-1">
                <div className="h-2.5 w-full rounded" style={{
                  background: `linear-gradient(to right, ${(aePalette as string[]).join(", ")})`,
                }} />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Baixa</span><span>Alta</span>
                </div>
              </div>
            )}
            {mode === "classify" && trainingSamples.length > 0 && (
              <div className="space-y-1 mt-1">
                {trainingSamples.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-300 truncate">{s.className} (#{s.classId})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-tab: Clustering ────────────────────────────────────────────────────────

function ClusteringTab({ summaryItems }: { summaryItems: ProvinceSummaryItem[] }) {
  const [k, setK] = useState(3);
  const [result, setResult] = useState<(KMeansResult & { provinceLabels: Record<string, number> }) | null>(null);
  const [running, setRunning] = useState(false);
  const { data: provinceGeoJSON } = useProvincesGeoJSON();

  async function runClustering() {
    setRunning(true);
    try {
      const features = summaryItems.map(buildProvinceFeatures);
      const res = await runKMeansInWorker(features, k, 200, 42);
      const provinceLabels: Record<string, number> = {};
      summaryItems.forEach((p, i) => { provinceLabels[p.province] = res.labels[i]; });
      setResult({ ...res, provinceLabels });
    } catch (err) {
      console.error("Clustering failed:", err);
    } finally {
      setRunning(false);
    }
  }

  const clusterKey = `cluster-${k}-${result?.iterations ?? 0}`;

  const clusterStats = useMemo(() => {
    if (!result) return [];
    const groups: ProvinceSummaryItem[][] = Array.from({ length: k }, () => []);
    summaryItems.forEach((p, i) => {
      if (result.labels[i] !== undefined) groups[result.labels[i]].push(p);
    });
    return groups.map((g, i) => ({
      cluster: i,
      provinces: g.map(p => p.province),
      avgArea: g.length ? Math.round(g.reduce((s, p) => s + p.totalAreaKm2, 0) / g.length) : 0,
      avgUnits: g.length ? Math.round(g.reduce((s, p) => s + p.totalUnits, 0) / g.length) : 0,
      avgFeatures: g.length ? Math.round(g.reduce((s, p) => s + p.totalFeatures, 0) / g.length) : 0,
    }));
  }, [result, summaryItems, k]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Parâmetros K-Means</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Número de clusters (K) — <strong className="text-slate-700">{k}</strong></label>
              <input type="range" min={2} max={Math.min(summaryItems.length, 6)} value={k} onChange={e => setK(Number(e.target.value))} className="w-full accent-sky-500" />
              <div className="flex justify-between text-xs text-slate-400"><span>2</span><span>{Math.min(summaryItems.length, 6)}</span></div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
              <div><strong>Features usadas (vector litológico):</strong></div>
              <div>· Frações das 6 famílias de rocha</div>
              <div>· Log-escala da área (peso reduzido)</div>
              <div className="pt-1 text-slate-400">→ Agrupa por composição, não por tamanho.</div>
            </div>
          </div>
          <button onClick={runClustering} disabled={running}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-sky-200">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? "A executar…" : "Executar Clustering"}
          </button>
        </div>
        {result && (
          <div className="p-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Métricas do Modelo</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Inércia</span><span className="font-semibold text-slate-800">{result.inertia.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Silhueta</span><span className={`font-semibold ${result.silhouette > 0.5 ? "text-emerald-600" : result.silhouette > 0.25 ? "text-amber-600" : "text-slate-600"}`}>{result.silhouette.toFixed(3)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Iterações</span><span className="font-semibold text-slate-800">{result.iterations}</span></div>
            </div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">Clusters</h4>
            <div className="space-y-2">
              {clusterStats.map(cs => (
                <div key={cs.cluster} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                  <div className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ background: CLUSTER_COLORS[cs.cluster] }} />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-700">Cluster {cs.cluster + 1}</div>
                    <div className="text-slate-500">{cs.provinces.join(", ")}</div>
                    <div className="text-slate-400 mt-0.5">Área média: {cs.avgArea.toLocaleString()} km²</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 relative overflow-hidden">
        {!result && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center pointer-events-none">
            <div className="bg-white/95 border border-slate-200 rounded-2xl px-6 py-5 shadow-lg text-center max-w-xs">
              <GitBranch size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-600">Configure os parâmetros e clique <strong>Executar Clustering</strong> para agrupar as províncias por similaridade geológica.</p>
            </div>
          </div>
        )}
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OSM &copy; CARTO" maxZoom={19} />
          <ScaleControl position="bottomleft" imperial={false} />
          {provinceGeoJSON && (
            <GeoJSON key={clusterKey} data={provinceGeoJSON}
              style={(f) => {
                const name = getProvinceName(f!);
                const label = result?.provinceLabels?.[name] ?? -1;
                return { color: "#ffffff", weight: 1.5, fillColor: label >= 0 ? CLUSTER_COLORS[label % CLUSTER_COLORS.length] : "#e2e8f0", fillOpacity: label >= 0 ? 0.72 : 0.2 };
              }}
              onEachFeature={(f, layer) => {
                const name = getProvinceName(f);
                const label = result?.provinceLabels?.[name] ?? -1;
                const pdata = summaryItems.find(p => p.province === name);
                layer.bindTooltip(`<b>${name}</b>${label >= 0 ? `<br/>Cluster ${label + 1}` : ""}${pdata ? `<br/>Unidades: ${pdata.totalUnits} · Área: ${pdata.totalAreaKm2.toLocaleString()} km²` : ""}`, { sticky: true });
              }}
            />
          )}
          <MapTools />
        </MapContainer>
      </div>
    </div>
  );
}

// ── Sub-tab: Mineral Favorability ─────────────────────────────────────────────

function FavorabilityTab({ summaryItems }: { summaryItems: ProvinceSummaryItem[] }) {
  const [mineral, setMineral] = useState<MineralType>("gold");
  const { data: provinceGeoJSON } = useProvincesGeoJSON();

  const results: FavorabilityResult[] = useMemo(() =>
    summaryItems.map(p => scoreFavorability(p.province, p.lithologies, p.eras, p.periods, mineral)).sort((a, b) => b.score - a.score),
    [summaryItems, mineral]
  );

  const resultMap = useMemo(() => { const m: Record<string, FavorabilityResult> = {}; results.forEach(r => { m[r.province] = r; }); return m; }, [results]);
  const maxScore = Math.max(...results.map(r => r.score), 0.01);
  const favKey = `fav-${mineral}`;

  const classColor: Record<string, string> = { "Alta": "text-red-600 bg-red-50", "Moderada": "text-amber-600 bg-amber-50", "Baixa": "text-sky-600 bg-sky-50", "Muito Baixa": "text-slate-500 bg-slate-50" };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-100 shrink-0">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tipo de Mineral</h4>
          <div className="space-y-1.5">
            {MINERAL_OPTIONS.map(opt => (
              <label key={opt.value} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors ${mineral === opt.value ? "bg-sky-50 border border-sky-200" : "hover:bg-slate-50 border border-transparent"}`}>
                <input type="radio" name="mineral" value={opt.value} checked={mineral === opt.value} onChange={() => setMineral(opt.value)} className="sr-only" />
                <span className="text-base">{opt.icon}</span>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${mineral === opt.value ? "text-sky-700" : "text-slate-700"}`}>{opt.label}</div>
                  <div className="text-xs text-slate-400 truncate">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Ranking de Províncias</h4>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={r.province} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{r.province}</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${classColor[r.classification]}`}>{r.classification}</span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(r.score / maxScore) * 100}%`, background: FAVORABILITY_GRADIENT(r.score) }} />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>{r.matchedKeywords.slice(0, 2).join(", ")}{r.matchedKeywords.length > 2 ? "…" : ""}</span>
                  <span className="font-mono">{(r.score * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute bottom-8 left-4 z-[500] bg-white/95 border border-slate-200 rounded-xl shadow-lg p-3 w-52 pointer-events-none">
          <div className="text-xs font-semibold text-slate-700 mb-1.5">Favorabilidade — {MINERAL_OPTIONS.find(m => m.value === mineral)?.label}</div>
          <div className="h-3 w-full rounded" style={{ background: `linear-gradient(to right, ${Array.from({ length: 8 }, (_, i) => FAVORABILITY_GRADIENT(i / 7)).join(", ")})` }} />
          <div className="flex justify-between text-xs text-slate-400 mt-1"><span>Muito Baixa</span><span>Alta</span></div>
        </div>
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OSM &copy; CARTO" maxZoom={19} />
          <ScaleControl position="bottomleft" imperial={false} />
          {provinceGeoJSON && (
            <GeoJSON key={favKey} data={provinceGeoJSON}
              style={(f) => { const name = getProvinceName(f!); const r = resultMap[name]; return { color: "#ffffff", weight: 1.5, fillColor: r ? FAVORABILITY_GRADIENT(r.score) : "#e2e8f0", fillOpacity: r ? Math.max(0.15, r.score * 0.85) : 0.2 }; }}
              onEachFeature={(f, layer) => { const name = getProvinceName(f); const r = resultMap[name]; layer.bindTooltip(`<b>${name}</b><br/>${r ? `Favorabilidade: <b>${r.classification}</b> (${(r.score * 100).toFixed(0)}%)<br/>Evidências: ${r.matchedKeywords.slice(0, 3).join(", ")}` : "Sem dados"}`, { sticky: true }); }}
            />
          )}
          <MapTools />
        </MapContainer>
      </div>
    </div>
  );
}

// ── Sub-tab: PCA ───────────────────────────────────────────────────────────────

function PCATab({ summaryItems }: { summaryItems: ProvinceSummaryItem[] }) {
  const { projected, explained } = useMemo(() => {
    const features = summaryItems.map(buildProvinceFeatures);
    const { data: norm } = normalize(features);
    return pca2(norm);
  }, [summaryItems]);

  if (!projected.length) return null;

  const xs = projected.map(p => p[0]), ys = projected.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 540, H = 360, PAD = 40;
  const toSvgX = (v: number) => PAD + ((v - minX) / (maxX - minX + 0.0001)) * (W - PAD * 2);
  const toSvgY = (v: number) => H - PAD - ((v - minY) / (maxY - minY + 0.0001)) * (H - PAD * 2);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Análise de Componentes Principais (PCA 2D)</h3>
        <p className="text-sm text-slate-500 mb-4">PC1 explica <strong>{explained[0]}%</strong> · PC2 explica <strong>{explained[1]}%</strong> da variância total.</p>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="w-full">
            {Array.from({ length: 5 }, (_, i) => (<line key={`hg${i}`} x1={PAD} y1={PAD + i * (H - PAD * 2) / 4} x2={W - PAD} y2={PAD + i * (H - PAD * 2) / 4} stroke="#f1f5f9" strokeWidth="1" />))}
            {Array.from({ length: 5 }, (_, i) => (<line key={`vg${i}`} x1={PAD + i * (W - PAD * 2) / 4} y1={PAD} x2={PAD + i * (W - PAD * 2) / 4} y2={H - PAD} stroke="#f1f5f9" strokeWidth="1" />))}
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#e2e8f0" strokeWidth="1.5" />
            <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">PC1 ({explained[0]}%)</text>
            <text x={12} y={H / 2} textAnchor="middle" fontSize="11" fill="#94a3b8" transform={`rotate(-90,12,${H / 2})`}>PC2 ({explained[1]}%)</text>
            {summaryItems.map((p, i) => {
              const cx = toSvgX(projected[i][0]), cy = toSvgY(projected[i][1]);
              return (<g key={p.province}><circle cx={cx} cy={cy} r={8} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} opacity={0.85} /><text x={cx} y={cy - 11} textAnchor="middle" fontSize="9" fill="#475569" fontWeight="600">{p.province.length > 10 ? p.province.slice(0, 9) + "…" : p.province}</text></g>);
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Sub-tab: About ─────────────────────────────────────────────────────────────

function AboutTab() {
  const roadmap = [
    { done: true,  item: "K-Means clustering geológico (K-Means++ em TypeScript)" },
    { done: true,  item: "Análise PCA 2D (power iteration, sem deps externas)" },
    { done: true,  item: "Mapa de favorabilidade mineral knowledge-based" },
    { done: true,  item: "Scoring para 7 tipos de minério (ouro, gemas, carvão, grafite, pesados, base, hidrocarbonetos)" },
    { done: true,  item: "WebWorker offloading para K-Means clustering" },
    { done: true,  item: "AlphaEarth Foundations: PCA, K-Means, Change Detection, Similarity Search, Classificação RF" },
    { done: false, item: "Random Forest via ONNX Runtime Web (modelo pré-treinado em Python)" },
    { done: false, item: "XGBoost via servidor Python scikit-learn / xgboost API" },
    { done: false, item: "Deep learning (CNN) sobre imagens Sentinel-2 para litologia automática" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl flex items-center justify-center"><BrainCircuit size={20} className="text-white" /></div>
            <div><h2 className="text-xl font-bold text-slate-900">GeoMoz AI Engine</h2><p className="text-sm text-slate-500">Módulo de inteligência artificial geológica</p></div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">O GeoMoz AI Engine aplica algoritmos de aprendizagem automática directamente sobre dados geológicos de Moçambique e os embeddings do AlphaEarth Foundations.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><TrendingUp size={14} className="text-sky-500" /> Roadmap de IA</h3>
          <div className="space-y-2">
            {roadmap.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 bg-white border border-slate-100 rounded-lg">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.done ? "bg-emerald-100" : "bg-slate-100"}`}>
                  <span className={`text-xs ${item.done ? "text-emerald-600" : "text-slate-400"}`}>{item.done ? "✓" : "○"}</span>
                </div>
                <span className={`text-sm leading-relaxed ${item.done ? "text-slate-700" : "text-slate-400"}`}>{item.item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GeoMozAI() {
  const [activeTab, setActiveTab] = useState<AITab>("clustering");
  const [loadEnabled, setLoadEnabled] = useState(false);
  const { data: summaryData, isLoading, error } = useProvinceSummary(loadEnabled);
  const summaryItems = summaryData?.provinces ?? [];

  const tabs: { id: AITab; label: string; icon: React.ReactNode }[] = [
    { id: "clustering",   label: "Clustering Geológico", icon: <GitBranch size={13} /> },
    { id: "favorability", label: "Mapa de Favorabilidade", icon: <Target size={13} /> },
    { id: "pca",          label: "Análise PCA",           icon: <BarChart2 size={13} /> },
    { id: "alphaearth",   label: "AlphaEarth",            icon: <Satellite size={13} /> },
    { id: "about",        label: "Sobre / Roadmap",       icon: <Info size={13} /> },
  ];

  const showLoadGate = activeTab !== "about" && activeTab !== "alphaearth";

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm"><BrainCircuit size={17} className="text-white" /></div>
          <div><h2 className="font-semibold text-slate-900 text-sm leading-tight">GeoMoz AI — Motor de Inteligência Artificial</h2><p className="text-xs text-slate-400">K-Means · PCA · Favorabilidade · AlphaEarth Foundations</p></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-medium">β — Em desenvolvimento activo</span>
          {summaryItems.length > 0 && <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">{summaryItems.length} províncias carregadas</span>}
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-1 shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id ? "border-violet-500 text-violet-600" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "alphaearth" ? (
        <AlphaEarthTab />
      ) : showLoadGate && !loadEnabled ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm text-center shadow-sm">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4"><BrainCircuit size={26} className="text-violet-500" /></div>
            <h3 className="font-bold text-slate-900 mb-2">Carregar Dados de Províncias</h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">O módulo AI precisa dos dados geológicos de todas as províncias para análise. A primeira execução pode demorar 15–30 s.</p>
            <button onClick={() => setLoadEnabled(true)} className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm shadow-violet-200"><Star size={14} className="inline mr-2" />Iniciar Análise AI</button>
          </div>
        </div>
      ) : isLoading && showLoadGate ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 size={26} className="text-violet-500 animate-spin" />
          <p className="font-semibold text-slate-700">A processar dados geológicos…</p>
        </div>
      ) : error && showLoadGate ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-sm text-center">
            <p className="text-sm text-red-700">Erro ao carregar dados. Verifique que a API Python está activa.</p>
            <button onClick={() => setLoadEnabled(false)} className="mt-3 text-xs text-red-500 hover:text-red-700">Tentar novamente</button>
          </div>
        </div>
      ) : (
        activeTab === "clustering" ? <ClusteringTab summaryItems={summaryItems} /> :
        activeTab === "favorability" ? <FavorabilityTab summaryItems={summaryItems} /> :
        activeTab === "pca" ? <PCATab summaryItems={summaryItems} /> :
        <AboutTab />
      )}
    </div>
  );
}

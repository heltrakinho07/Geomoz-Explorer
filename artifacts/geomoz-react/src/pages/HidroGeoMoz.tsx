/**
 * HidroGeoMoz — Módulo de Análise de Bacias Hidrográficas
 *
 * Integra HydroBASINS/HydroSHEDS (via GEE), dados DEM Copernicus,
 * Sentinel-2 (NDVI/NDWI), CHIRPS (precipitação) e geologia GeoMoz.
 */

import { useState, useCallback, useRef } from "react";
import {
  MapContainer, TileLayer, GeoJSON, ScaleControl, ZoomControl,
} from "react-leaflet";
import type { Map as LMap, Layer, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Droplets, Loader2, Play, ChevronDown, Download, RefreshCw,
  AlertTriangle, CheckCircle2, Info, Activity, Layers,
  TrendingDown, TrendingUp, Wind, Waves, Zap, FileText,
  BarChart2, Globe,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, RadialBarChart, RadialBar, Legend,
} from "recharts";

import { useProvinceNames, useDistrictNames, useProvincesGeoJSON, useStats } from "@/hooks/useGeoMoz";

// ── Types ────────────────────────────────────────────────────────────────────

interface BasinsResult {
  tileUrl: string;
  geojson: GeoJSON.FeatureCollection;
  count:   number;
  level:   number;
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

interface DrainageResult {
  tileUrl:   string;
  threshold: number;
}

interface GeeStatus { connected: boolean; message?: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(v: number): string {
  if (v < 30) return "#22c55e";
  if (v < 55) return "#f59e0b";
  if (v < 75) return "#f97316";
  return "#ef4444";
}

function riskLabel(v: number): string {
  if (v < 30) return "Baixo";
  if (v < 55) return "Moderado";
  if (v < 75) return "Alto";
  return "Muito alto";
}

function RiskGauge({ label, value, icon: Icon, invert = false }: {
  label: string; value: number; icon: React.ElementType; invert?: boolean;
}) {
  const display = invert ? 100 - value : value;
  const color   = riskColor(invert ? value : value);
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 font-medium">{label}</span>
          <span className="text-xs font-bold" style={{ color }}>{riskLabel(invert ? 100 - display : value)}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">{value.toFixed(0)} / 100</div>
      </div>
    </div>
  );
}

function StatRow({ label, value, unit = "" }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800 font-mono">
        {value}<span className="text-slate-400 font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  province:         string | null;
  district:         string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
}

export default function HidroGeoMoz({ province, district, onProvinceChange, onDistrictChange }: Props) {
  const mapRef = useRef<LMap | null>(null);

  // ── Data states ─────────────────────────────────────────────────────────
  const [basinsData,    setBasinsData]    = useState<BasinsResult | null>(null);
  const [drainageTile,  setDrainageTile]  = useState<DrainageResult | null>(null);
  const [selectedFeat,  setSelectedFeat]  = useState<GeoJSON.Feature | null>(null);
  const [basinStats,    setBasinStats]    = useState<BasinStats | null>(null);
  const [geeStatus,     setGeeStatus]     = useState<GeeStatus | null>(null);
  const [basinLevel,    setBasinLevel]    = useState(6);
  const [drainThresh,   setDrainThresh]   = useState(500);
  const [showDrainage,  setShowDrainage]  = useState(true);
  const [opacity,       setOpacity]       = useState(0.6);

  // ── Loading / error states ───────────────────────────────────────────────
  const [loadingBasins,    setLoadingBasins]    = useState(false);
  const [loadingStats,     setLoadingStats]     = useState(false);
  const [loadingDrainage,  setLoadingDrainage]  = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  // ── GeoMoz data ──────────────────────────────────────────────────────────
  const { data: provinceNames } = useProvinceNames();
  const { data: districtNames } = useDistrictNames(province);
  const { data: provincesGeoJSON } = useProvincesGeoJSON();
  const { data: statsData } = useStats(province, district);

  // ── GEE status ──────────────────────────────────────────────────────────
  const checkGEE = useCallback(async () => {
    try {
      const r = await fetch("/geomoz-api/gee/status");
      const d = await r.json();
      setGeeStatus(d);
      return d.connected as boolean;
    } catch { setGeeStatus({ connected: false }); return false; }
  }, []);

  // ── Load basins ──────────────────────────────────────────────────────────
  async function loadBasins() {
    setError(null); setLoadingBasins(true); setBasinsData(null);
    setSelectedFeat(null); setBasinStats(null);

    const ok = await checkGEE();
    if (!ok) { setLoadingBasins(false); return; }

    try {
      const [bRes, dRes] = await Promise.all([
        fetch("/geomoz-api/gee/basins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ province, district, level: basinLevel }),
        }),
        showDrainage
          ? fetch("/geomoz-api/gee/drainage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ province, district, threshold: drainThresh }),
            })
          : Promise.resolve(null),
      ]);

      if (!bRes.ok) throw new Error((await bRes.json()).detail ?? bRes.statusText);
      setBasinsData(await bRes.json());

      if (dRes) {
        if (dRes.ok) setDrainageTile(await dRes.json());
        else setDrainageTile(null);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setLoadingBasins(false); }
  }

  // ── Click basin → fetch stats ────────────────────────────────────────────
  async function onBasinClick(feat: GeoJSON.Feature) {
    setSelectedFeat(feat);
    setBasinStats(null);
    setLoadingStats(true);
    try {
      const r = await fetch("/geomoz-api/gee/basin-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: feat.geometry }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setBasinStats(await r.json());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setLoadingStats(false); }
  }

  // ── Load drainage separately ─────────────────────────────────────────────
  async function reloadDrainage() {
    setLoadingDrainage(true);
    try {
      const r = await fetch("/geomoz-api/gee/drainage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ province, district, threshold: drainThresh }),
      });
      if (r.ok) setDrainageTile(await r.json());
    } catch { /* silent */ } finally { setLoadingDrainage(false); }
  }

  // ── GeoJSON style ────────────────────────────────────────────────────────
  function basinStyle(feat?: GeoJSON.Feature) {
    const isSelected = feat?.properties?.HYBAS_ID === selectedFeat?.properties?.HYBAS_ID;
    return {
      color:       isSelected ? "#f59e0b" : "#1a73e8",
      weight:      isSelected ? 2.5 : 1,
      fillColor:   isSelected ? "#f59e0b" : "#1a73e8",
      fillOpacity: isSelected ? 0.25 : 0.08,
      opacity:     1,
    };
  }

  // ── Export helpers ───────────────────────────────────────────────────────
  function exportCSV() {
    if (!basinStats) return;
    const rows = [
      ["Métrica", "Valor", "Unidade"],
      ["Área", basinStats.areaKm2, "km²"],
      ["Perímetro", basinStats.perimeterKm, "km"],
      ["Elevação mínima", basinStats.elevMinM, "m"],
      ["Elevação média", basinStats.elevMeanM, "m"],
      ["Elevação máxima", basinStats.elevMaxM, "m"],
      ["Declive médio", basinStats.slopeMeanDeg, "°"],
      ["NDVI médio", basinStats.ndviMean ?? "—", ""],
      ["NDWI médio", basinStats.ndwiMean ?? "—", ""],
      ["Precipitação anual", basinStats.precipMmYr, "mm/ano"],
      ["Risco erosão", basinStats.erosionRisk, "/100"],
      ["Risco cheia", basinStats.floodRisk, "/100"],
      ["Potencial hidrogeológico", basinStats.hydroPotential, "/100"],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `bacia_stats_${province ?? "MZ"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportGeoJSON() {
    if (!selectedFeat) return;
    const blob = new Blob([JSON.stringify(selectedFeat, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `bacia_${selectedFeat.properties?.HYBAS_ID ?? "selected"}.geojson`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Geology chart data ────────────────────────────────────────────────────
  const CHART_COLORS = ["#1a73e8","#34a853","#fbbc04","#ea4335","#9c27b0","#00bcd4","#ff5722","#607d8b"];

  const lithoChartData = (statsData?.lithologies ?? []).slice(0, 8).map((l, i) => ({
    name:  l.name.length > 14 ? l.name.slice(0, 14) + "…" : l.name,
    value: parseFloat(l.percent.toFixed(1)),
    color: CHART_COLORS[i % 8],
  }));

  const eraChartData = (statsData?.lithologies ?? []).slice(0, 6).map((l, i) => ({
    name:  l.name.length > 10 ? l.name.slice(0, 10) + "…" : l.name,
    value: parseFloat(l.areaKm2.toFixed(1)),
    color: ["#3b82f6","#f59e0b","#10b981","#ef4444","#8b5cf6","#06b6d4"][i % 6],
  })).sort((a, b) => b.value - a.value);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 overflow-y-auto shrink-0">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm">
              <Droplets size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 leading-tight">Bacias Hidrográficas</h2>
              <p className="text-[10px] text-slate-400">HydroSHEDS · GEE · GeoMoz</p>
            </div>
          </div>
          {geeStatus && (
            <div className={`mt-2 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg ${geeStatus.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {geeStatus.connected
                ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
              {geeStatus.connected ? "GEE conectado" : "GEE offline — verifique credenciais"}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="p-4 space-y-3 border-b border-slate-100">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Área de Estudo</h4>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block font-medium">Província</label>
            <div className="relative">
              <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={province ?? ""}
                onChange={e => { onProvinceChange(e.target.value || null); onDistrictChange(null); }}>
                <option value="">Moçambique (todo)</option>
                {provinceNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {province && (
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block font-medium">Distrito</label>
              <div className="relative">
                <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={district ?? ""}
                  onChange={e => onDistrictChange(e.target.value || null)}>
                  <option value="">Toda a província</option>
                  {districtNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Basin settings */}
        <div className="p-4 space-y-3 border-b border-slate-100">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Configuração</h4>

          <div>
            <label className="text-[10px] text-slate-500 mb-1 block font-medium">
              Resolução HydroBASINS — <strong className="text-slate-700">Nível {basinLevel}</strong>
            </label>
            <input type="range" min={5} max={8} step={1} value={basinLevel}
              onChange={e => setBasinLevel(Number(e.target.value))} className="w-full accent-blue-500" />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>Grandes (L5)</span><span>Detalhado (L8)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-slate-500 font-medium">Rede de Drenagem</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showDrainage}
                  onChange={e => setShowDrainage(e.target.checked)}
                  className="accent-blue-500" />
                <span className="text-[10px] text-slate-600">Mostrar</span>
              </label>
            </div>
            {showDrainage && (
              <>
                <input type="range" min={100} max={2000} step={100} value={drainThresh}
                  onChange={e => setDrainThresh(Number(e.target.value))} className="w-full accent-cyan-500" />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>Rios pequenos</span><span>Rios principais</span>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="text-[10px] text-slate-500 mb-1 block font-medium">
              Opacidade — <strong className="text-slate-700">{Math.round(opacity * 100)}%</strong>
            </label>
            <input type="range" min={0.2} max={1} step={0.05} value={opacity}
              onChange={e => setOpacity(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>

          <button onClick={loadBasins} disabled={loadingBasins}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-blue-200">
            {loadingBasins
              ? <><Loader2 size={14} className="animate-spin" /> A carregar bacias…</>
              : <><Play size={14} /> Carregar Bacias</>}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] text-red-700">
              <strong>Erro:</strong> {error}
            </div>
          )}

          {basinsData && !loadingBasins && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-700 flex items-center gap-1.5">
              <CheckCircle2 size={11} />
              {basinsData.count} bacias carregadas (nível {basinsData.level})
              {basinsData.count > 200 && " — exibindo 200 primeiras"}
            </div>
          )}
        </div>

        {/* Selected basin stats */}
        {selectedFeat && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Bacia Seleccionada</h4>
              <span className="text-[10px] text-slate-400 font-mono">
                ID {selectedFeat.properties?.HYBAS_ID ?? "—"}
              </span>
            </div>

            {loadingStats && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-4 justify-center">
                <Loader2 size={13} className="animate-spin text-blue-500" />
                A calcular estatísticas GEE…
              </div>
            )}

            {basinStats && !loadingStats && (
              <>
                {/* Morphometry */}
                <div className="bg-slate-50 rounded-xl p-3 space-y-0">
                  <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Morfometria</h5>
                  <StatRow label="Área" value={basinStats.areaKm2.toLocaleString("pt-PT")} unit="km²" />
                  <StatRow label="Perímetro" value={basinStats.perimeterKm.toFixed(1)} unit="km" />
                  <StatRow label="Elevação mín." value={basinStats.elevMinM.toFixed(0)} unit="m" />
                  <StatRow label="Elevação média" value={basinStats.elevMeanM.toFixed(0)} unit="m" />
                  <StatRow label="Elevação máx." value={basinStats.elevMaxM.toFixed(0)} unit="m" />
                  <StatRow label="Declive médio" value={basinStats.slopeMeanDeg.toFixed(1)} unit="°" />
                </div>

                {/* Vegetation & water */}
                <div className="bg-slate-50 rounded-xl p-3 space-y-0">
                  <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Vegetação & Água</h5>
                  <StatRow label="NDVI médio" value={basinStats.ndviMean != null ? basinStats.ndviMean.toFixed(3) : "—"} />
                  <StatRow label="NDWI médio" value={basinStats.ndwiMean != null ? basinStats.ndwiMean.toFixed(3) : "—"} />
                  <StatRow label="Precipitação" value={basinStats.precipMmYr.toFixed(0)} unit="mm/ano" />
                </div>

                {/* Risk gauges */}
                <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Índices de Risco</h5>
                <RiskGauge label="Risco de Erosão"    value={basinStats.erosionRisk}    icon={Wind} />
                <RiskGauge label="Risco de Cheia"     value={basinStats.floodRisk}      icon={Waves} />
                <RiskGauge label="Potencial Hidrogeo." value={basinStats.hydroPotential} icon={Zap} invert />

                {/* Export */}
                <div className="flex gap-2">
                  <button onClick={exportCSV}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors">
                    <Download size={11} /> CSV
                  </button>
                  <button onClick={exportGeoJSON}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors">
                    <FileText size={11} /> GeoJSON
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {!selectedFeat && basinsData && (
          <div className="p-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-700 flex items-start gap-2">
              <Info size={13} className="mt-0.5 shrink-0" />
              Clique numa bacia no mapa para ver as estatísticas detalhadas.
            </div>
          </div>
        )}
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <MapContainer
          center={[-18, 35]} zoom={5}
          style={{ height: "100%", width: "100%" }}
          ref={mapRef}
          zoomControl={false}
        >
          <ZoomControl position="topright" />
          <ScaleControl position="bottomright" imperial={false} />

          {/* Base tiles */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            maxZoom={19}
          />

          {/* Province boundaries */}
          {provincesGeoJSON && (
            <GeoJSON
              key="provinces"
              data={provincesGeoJSON as GeoJSON.GeoJsonObject}
              style={{ color: "#64748b", weight: 1.2, fillOpacity: 0, opacity: 0.5 }}
            />
          )}

          {/* Basins GeoJSON layer (clickable) */}
          {basinsData?.geojson && (
            <GeoJSON
              key={`basins-${basinsData.level}-${province}-${district}`}
              data={basinsData.geojson as GeoJSON.GeoJsonObject}
              style={f => basinStyle(f)}
              onEachFeature={(feat, layer: Layer) => {
                const p = feat.properties ?? {};
                layer.bindTooltip(
                  `<div class="text-xs"><b>Bacia ${p.HYBAS_ID ?? "—"}</b><br/>Área: ${(p.SUB_AREA ?? 0).toFixed(0)} km²</div>`,
                  { sticky: true }
                );
                layer.on("click", () => onBasinClick(feat));
              }}
            />
          )}

          {/* Drainage tile */}
          {showDrainage && drainageTile && (
            <TileLayer
              key={`drain-${drainageTile.tileUrl}`}
              url={drainageTile.tileUrl}
              attribution="HydroSHEDS · WWF"
              opacity={0.85}
              maxZoom={18}
            />
          )}
        </MapContainer>

        {/* Map legend */}
        <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-blue-100 p-3 pointer-events-none text-[11px]">
          <div className="font-semibold text-blue-800 mb-1.5 flex items-center gap-1"><Droplets size={11} /> HydroBASINS</div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block w-5 h-2 rounded border border-blue-500 bg-blue-500/10" />
            <span className="text-slate-600">Bacia hidrográfica</span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block w-5 h-2 rounded border border-amber-400 bg-amber-400/25" />
            <span className="text-slate-600">Bacia seleccionada</span>
          </div>
          {showDrainage && drainageTile && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-1 bg-blue-700 rounded" />
              <span className="text-slate-600">Rede de drenagem</span>
            </div>
          )}
        </div>

        {/* Basin count badge */}
        {basinsData && (
          <div className="absolute top-4 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-sm border border-blue-100 px-3 py-1.5 text-[11px] text-blue-700 flex items-center gap-1.5">
            <Layers size={11} />
            {basinsData.count} bacias · Nível {basinsData.level}
          </div>
        )}

        {/* Loading overlay */}
        {(loadingBasins || loadingDrainage) && (
          <div className="absolute inset-0 z-[600] bg-white/60 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 px-6 py-4 flex items-center gap-3">
              <Loader2 size={18} className="text-blue-500 animate-spin" />
              <span className="text-sm text-slate-700 font-medium">
                {loadingBasins ? "A carregar bacias do HydroSHEDS…" : "A carregar rede de drenagem…"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel — Charts & Geology ────────────────────────────────── */}
      {(basinStats || statsData) && (
        <div className="w-80 flex flex-col bg-white border-l border-slate-200 overflow-y-auto shrink-0">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BarChart2 size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-slate-800">Análise Geocientífica</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Geologia GeoMoz · {province ?? "Moçambique"}
              {district ? ` / ${district}` : ""}
            </p>
          </div>

          <div className="flex-1 p-4 space-y-5">
            {/* Lithology bar chart */}
            {lithoChartData.length > 0 && (
              <div>
                <h5 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Activity size={10} /> Top Litologias por Área
                </h5>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={lithoChartData} layout="vertical" margin={{ left: 4, right: 8, top: 0, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={72} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Área"]} />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                      {lithoChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ERA chart */}
            {eraChartData.length > 0 && (
              <div>
                <h5 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <Globe size={10} /> Distribuição por Era Geológica
                </h5>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={eraChartData} margin={{ left: 4, right: 8, top: 0, bottom: 20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-25} textAnchor="end" />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}`} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)} km²`, "Área"]} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {eraChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Geology stats table */}
            {statsData && (
              <div>
                <h5 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Layers size={10} /> Unidades Geológicas
                </h5>
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
                          <td className="p-2 text-slate-700 truncate max-w-[110px]">{l.name}</td>
                          <td className="p-2 text-right text-slate-600 font-mono">{l.areaKm2.toFixed(0)}</td>
                          <td className="p-2 text-right text-slate-600 font-mono">{l.percent.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <Info size={9} />
                  Litologia dominante: <strong className="text-slate-600 ml-0.5">{statsData.dominant}</strong>
                </div>
              </div>
            )}

            {/* Risk summary */}
            {basinStats && (
              <div>
                <h5 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingUp size={10} /> Resumo de Riscos
                </h5>
                <div className="space-y-2">
                  <RiskGauge label="Risco de Erosão"     value={basinStats.erosionRisk}    icon={Wind} />
                  <RiskGauge label="Risco de Cheia"      value={basinStats.floodRisk}      icon={Waves} />
                  <RiskGauge label="Potencial Hidrogeo." value={basinStats.hydroPotential} icon={Zap} invert />
                </div>
                <div className="mt-3 p-2.5 bg-blue-50 rounded-xl border border-blue-100 text-[11px] text-blue-700 leading-relaxed">
                  <strong>Nota metodológica:</strong> Os índices são proxies baseados em DEM, NDVI e precipitação CHIRPS.
                  Para avaliação definitiva, recomenda-se análise de campo.
                </div>
              </div>
            )}

            {!basinStats && !statsData && (
              <div className="text-center py-8 text-slate-400 text-xs">
                Selecione uma área e carregue as bacias para ver análise.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

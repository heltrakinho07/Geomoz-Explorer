/**
 * GeoAnálises — Sentinel-2 spectral analysis module.
 *
 * Two modes:
 *  GEE Mode  — real Sentinel-2 imagery from Google Earth Engine (requires credentials)
 *  Proxy Mode — synthetic spectral maps derived from geological attributes (always available)
 *
 * GEE tile URLs returned by the Python API are valid for ~24 h and served
 * directly by Google's infrastructure — Leaflet fetches them with no additional auth.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  MapContainer, TileLayer, GeoJSON, WMSTileLayer, ScaleControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Satellite, BarChart2, Layers, Info, ChevronDown,
  Cpu, FlaskConical, CloudSun, Droplets, Flame,
  CheckCircle2, XCircle, Loader2, Play, RefreshCw,
  ExternalLink, ShieldCheck,
  Mountain, MountainSnow, TrendingUp, Sun, Trees, Sliders, Sparkles, MapPin,
} from "lucide-react";

import { useGeologyGeoJSON, useProvincesGeoJSON, useProvinceNames, useDistrictNames } from "@/hooks/useGeoMoz";
import { computeSpectralValue, applyColormap, SpectralIndex, GEE_ONLY_INDICES } from "@/lib/geoml";

// ── Types ─────────────────────────────────────────────────────────────────────

type SpectralTab = "s2" | "composite" | SpectralIndex;

type IndexGroup = "spectral" | "landsat" | "terrain";

interface GeeStatus {
  connected: boolean;
  auth_type: string | null;
  project: string | null;
  message: string;
  indices: string[];
}

interface GeeResult {
  tileUrl: string;
  name: string;
  formula: string;
  bands: string;
  sceneCount: number;
  dateRange: string;
  stats: Record<string, number>;
  province?: string | null;
}

interface IndexDef {
  id: SpectralIndex;
  label: string;
  short: string;
  icon: React.ReactNode;
  group: IndexGroup;
  formula: string;
  bands: string;
  interpretation: string;
  lowLabel: string;
  highLabel: string;
}

const INDEX_DEFS: IndexDef[] = [
  // ── Sentinel-2 spectral ────────────────────────────────────────────────
  { id: "ndvi", label: "NDVI", short: "Vegetação", icon: <CloudSun size={13} />, group: "spectral",
    formula: "NDVI = (B8 − B4) / (B8 + B4)",
    bands: "NIR (B8) · Vermelho (B4)",
    interpretation: "Valores > 0.5 indicam cobertura vegetal densa (depósitos quaternários, aluviões). Valores negativos = rocha exposta, água.",
    lowLabel: "Rocha / solo", highLabel: "Vegetação densa" },
  { id: "fe_oxide", label: "Fe-Óxidos", short: "Fe-Óxidos", icon: <Flame size={13} />, group: "spectral",
    formula: "Fe-Oxide = B4 / B2",
    bands: "Vermelho (B4) · Azul (B2)",
    interpretation: "Detecta BIF, laterite e gossã sobre sulfuretos. Fundamental para prospecção de Fe, Mn e zonas de oxidação.",
    lowLabel: "Rocha fresca", highLabel: "BIF / laterite / gossã" },
  { id: "clay", label: "Argilas", short: "Argilas", icon: <Droplets size={13} />, group: "spectral",
    formula: "Clay = B11 / B8A",
    bands: "SWIR1 (B11) · Red-Edge3 (B8A)",
    interpretation: "Minerais argilosos (caulinite, esmectite, illite). Mapeia saprolite e zonas de alteração argílica.",
    lowLabel: "Quartzo / rocha fresca", highLabel: "Argilas / xisto / saprolite" },
  { id: "hydrothermal", label: "Hidrotermal", short: "Hidrotermal", icon: <FlaskConical size={13} />, group: "spectral",
    formula: "(B11+B4) / (B8A+B3)",
    bands: "SWIR1 (B11) · B4 · Red-Edge3 (B8A) · Verde (B3)",
    interpretation: "Zonas de alteração hidrotermal (silicificação, sericitização, argilização). Crítico para prospecção de Au, Ag, Cu, Mo.",
    lowLabel: "Sem alteração", highLabel: "Skarn / greisen / alteração intensa" },
  { id: "bare_soil", label: "Solo Exposto", short: "BSI", icon: <BarChart2 size={13} />, group: "spectral",
    formula: "(B11+B4−B8−B2) / (B11+B4+B8+B2)",
    bands: "B11 · B4 · NIR (B8) · Azul (B2)",
    interpretation: "Zonas de solo exposto e erosão. Mapeia áreas de mineração activa e monitorização de uso do solo.",
    lowLabel: "Vegetação / escuro", highLabel: "Solo / rocha exposta" },

  // ── Landsat 8 ──────────────────────────────────────────────────────────
  { id: "ndvi_l8", label: "NDVI L8", short: "NDVI L8", icon: <Trees size={13} />, group: "landsat",
    formula: "NDVI = (SR_B5 − SR_B4) / (SR_B5 + SR_B4)",
    bands: "NIR (SR_B5) · Vermelho (SR_B4)",
    interpretation: "NDVI Landsat 8 (resolução 30 m, série temporal desde 2013). Complementar ao Sentinel-2.",
    lowLabel: "Rocha / água", highLabel: "Vegetação densa" },

  // ── Terrain (Copernicus GLO-30 DEM + HydroSHEDS) ───────────────────────
  { id: "elevation", label: "Elevação", short: "Elevação", icon: <Mountain size={13} />, group: "terrain",
    formula: "DEM Copernicus GLO-30 (focal_mean 3 m)",
    bands: "Copernicus DEM GLO-30 (30 m)",
    interpretation: "Modelo digital de elevação em metros acima do nível do mar. Base para todos os índices de relevo.",
    lowLabel: "Planície / costa", highLabel: "Montanha" },
  { id: "hipsometry", label: "Hipsometria", short: "Hipsometria", icon: <TrendingUp size={13} />, group: "terrain",
    formula: "(DEM − min) / (max − min) — normalizada no recorte",
    bands: "Copernicus DEM GLO-30",
    interpretation: "Distribuição relativa de altitudes dentro da área seleccionada. Realça contrastes topográficos locais.",
    lowLabel: "Cotas baixas", highLabel: "Cotas altas" },
  { id: "slope", label: "Declive", short: "Declive", icon: <MountainSnow size={13} />, group: "terrain",
    formula: "ee.Terrain.slope(DEM) em graus",
    bands: "Copernicus DEM GLO-30",
    interpretation: "Inclinação do terreno em graus. >30° indica encostas íngremes — risco geotécnico, erosão.",
    lowLabel: "0° plano", highLabel: "≥35° muito íngreme" },
  { id: "hillshade", label: "Hillshade", short: "Sombreado", icon: <Sun size={13} />, group: "terrain",
    formula: "ee.Terrain.hillshade(DEM, azimuth=315°, elevation=45°)",
    bands: "Copernicus DEM GLO-30",
    interpretation: "Sombreado de relevo iluminado a NW — usado como camada visual para realçar morfologia.",
    lowLabel: "Sombra", highLabel: "Iluminado" },
  { id: "topo_class", label: "Classes Topo", short: "Classes Topo", icon: <Layers size={13} />, group: "terrain",
    formula: "DEM em [<5, 5–10, 10–30, 30–60, >60] m + rios HydroSHEDS",
    bands: "Copernicus DEM + HydroSHEDS FreeFlowingRivers",
    interpretation: "Classificação topográfica em 5 classes morfológicas + máscara de água. Replica a metodologia do script GEE de Sofala.",
    lowLabel: "Planície", highLabel: "Colinas altas + água" },
];

const TERRAIN_CLASS_NAMES = [
  "Planície / < 5 m",
  "Planície Baixa / 5–10 m",
  "Planície Média / 10–30 m",
  "Colinas Baixas / 30–60 m",
  "Colinas Altas / > 60 m",
  "Água & Rios",
];

// ── Colormap legend ────────────────────────────────────────────────────────────

function ColormapLegend({ index }: { index: SpectralIndex }) {
  const def = INDEX_DEFS.find(d => d.id === index)!;
  const stops = Array.from({ length: 10 }, (_, i) =>
    applyColormap(i / 9, index)
  ).join(", ");
  return (
    <div>
      <div className="h-3.5 w-full rounded" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <div className="flex justify-between text-xs text-slate-400 mt-0.5">
        <span>{def.lowLabel}</span>
        <span>{def.highLabel}</span>
      </div>
    </div>
  );
}

// ── GEE Status badge ───────────────────────────────────────────────────────────

function GeeStatusBadge({ status }: { status: GeeStatus | null; loading: boolean }) {
  if (!status) return null;
  return status.connected ? (
    <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
      <CheckCircle2 size={11} /> GEE Conectado · {status.project || status.auth_type}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
      <XCircle size={11} /> GEE Desligado
    </span>
  );
}

// ── GEE Setup Guide ────────────────────────────────────────────────────────────

function GeeSetupGuide({ onRetry }: { onRetry: () => void }) {
  const steps = [
    {
      n: 1, title: "Conta Google Earth Engine",
      desc: "Aceda a earthengine.google.com e registe-se (gratuito para uso não-comercial).",
      link: "https://earthengine.google.com/",
    },
    {
      n: 2, title: "Criar Projecto GCP",
      desc: "Em console.cloud.google.com, crie um projecto e active a API 'Earth Engine'.",
      link: "https://console.cloud.google.com/",
    },
    {
      n: 3, title: "Criar Service Account",
      desc: "Em IAM → Service Accounts, crie uma conta com o papel 'Earth Engine Resource Viewer'. Descarregue a chave JSON.",
      link: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    },
    {
      n: 4, title: "Registar o Service Account no GEE",
      desc: "Em code.earthengine.google.com → Assets → Service Accounts, registe o email do service account.",
      link: "https://code.earthengine.google.com/",
    },
    {
      n: 5, title: "Configurar Secrets no Replit",
      desc: 'Adicione o secret GEE_SERVICE_ACCOUNT_KEY com o conteúdo completo do ficheiro JSON da chave. Opcionalmente, defina GEE_PROJECT_ID.',
      link: null,
    },
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
          <XCircle size={20} className="text-red-500" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Google Earth Engine não configurado</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure as credenciais para activar análise real com Sentinel-2.
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map(s => (
          <li key={s.n} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{s.title}</span>
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-600">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-emerald-300 leading-relaxed">
        <div className="text-slate-500 mb-1"># Secret a configurar no Replit:</div>
        <div>GEE_SERVICE_ACCOUNT_KEY = {"{"} ...conteúdo do .json... {"}"}</div>
        <div>GEE_PROJECT_ID = my-gcp-project-id   <span className="text-slate-500"># opcional</span></div>
      </div>

      <button
        onClick={onRetry}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <RefreshCw size={14} /> Verificar ligação GEE
      </button>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400 text-center">
          Sem credenciais GEE, o módulo usa o <strong>Modo Proxy</strong> (índices sintéticos derivados de dados geológicos).
        </p>
      </div>
    </div>
  );
}

// ── GEE Analysis Panel ─────────────────────────────────────────────────────────

function GeeAnalysisPanel({
  activeIndex, province, district, geeStatus, onTileReady,
}: {
  activeIndex: SpectralIndex;
  province: string | null;
  district: string | null;
  geeStatus: GeeStatus;
  onTileReady: (result: GeeResult | null) => void;
}) {
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate]     = useState("2023-12-31");
  const [cloudPct, setCloudPct]   = useState(30);
  const [running, setRunning]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [result, setResult]       = useState<GeeResult | null>(null);

  const def = INDEX_DEFS.find(d => d.id === activeIndex)!;

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    onTileReady(null);
    try {
      const res = await fetch("/geomoz-api/gee/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index:      activeIndex,
          province:   province || null,
          district:   district || null,
          start_date: startDate,
          end_date:   endDate,
          cloud_pct:  cloudPct,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE desconhecido");
      }
      const data: GeeResult = await res.json();
      setResult(data);
      onTileReady(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRunning(false);
    }
  }

  const statLabels: Record<string, string> = {
    p10: "P10", p25: "P25", p50: "Mediana", p75: "P75", p90: "P90",
  };

  return (
    <div className="space-y-4">
      {/* Parameters */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Parâmetros GEE</h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data fim</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Cobertura de nuvens máx — <strong className="text-slate-700">{cloudPct}%</strong>
            </label>
            <input type="range" min={5} max={80} value={cloudPct} onChange={e => setCloudPct(Number(e.target.value))}
              className="w-full accent-sky-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Área de análise (clipping)</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
              <MapPin size={12} className="text-sky-500" />
              {district
                ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
                : province
                  ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                  : <span className="text-slate-500">Moçambique (toda)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={runAnalysis}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-sky-200"
      >
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A processar no GEE…</>
          : <><Play size={14} /> Calcular {def.short} com Sentinel-2</>}
      </button>

      {running && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-700 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          O GEE está a carregar cenas Sentinel-2, aplicar máscara de nuvens e calcular o índice. Tipicamente 5–20 s.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 leading-relaxed">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* Result */}
      {result && !running && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Análise GEE completa</span>
            </div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              <div>{result.sceneCount} cenas Sentinel-2 usadas</div>
              <div>Período: {result.dateRange}</div>
            </div>
          </div>

          {Object.keys(result.stats).length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Estatísticas do índice</h5>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(result.stats).map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="text-xs text-slate-400">{statLabels[k] ?? k}</div>
                    <div className="text-sm font-bold text-slate-800 font-mono">{v.toFixed(3)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            <strong>Nota:</strong> O tile GEE é válido ~24 h. Clique novamente em "Calcular" para refrescar.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composite (weighted) Panel ─────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
  ndvi: 0.30, hipsometry: 0.25, slope: 0.20, fe_oxide: 0.15, hydrothermal: 0.10,
};

function CompositePanel({
  province, district, onTileReady,
}: {
  province: string | null;
  district: string | null;
  onTileReady: (result: GeeResult | null) => void;
}) {
  const [weights, setWeights]     = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate]     = useState("2023-12-31");
  const [cloudPct, setCloudPct]   = useState(30);
  const [running, setRunning]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [result, setResult]       = useState<GeeResult | null>(null);

  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);

  function setW(id: string, v: number) {
    setWeights(w => ({ ...w, [id]: v }));
  }

  async function run() {
    setRunning(true); setError(null); onTileReady(null);
    try {
      const res = await fetch("/geomoz-api/gee/composite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weights, province: province || null, district: district || null,
          start_date: startDate, end_date: endDate, cloud_pct: cloudPct,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE desconhecido");
      }
      const data: GeeResult = await res.json();
      setResult(data); onTileReady(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-violet-50 to-sky-50 border border-violet-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={12} className="text-violet-600" />
          <span className="text-xs font-semibold text-violet-700">Combinação Ponderada</span>
        </div>
        <p className="text-xs text-violet-700 leading-relaxed">
          Cada índice é normalizado para [0,1] e combinado com o peso atribuído.
          Os pesos são renormalizados para somar 1 antes do cálculo.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pesos dos Índices</h4>
          <span className="text-xs text-slate-400">Σ {totalWeight.toFixed(2)}</span>
        </div>
        <div className="space-y-2.5">
          {INDEX_DEFS.map(def => {
            const w = weights[def.id] ?? 0;
            return (
              <div key={def.id}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-600 flex items-center gap-1.5">
                    {def.icon} {def.short}
                  </label>
                  <span className={`text-xs font-mono ${w > 0 ? "text-violet-600 font-semibold" : "text-slate-300"}`}>
                    {w.toFixed(2)}
                  </span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={w}
                  onChange={e => setW(def.id, Number(e.target.value))}
                  className={`w-full ${w > 0 ? "accent-violet-500" : "accent-slate-300"}`} />
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setWeights(DEFAULT_WEIGHTS)}
          className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline">
          Repor pesos padrão
        </button>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2.5">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Data início (S2/L8)</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Data fim</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">
            Nuvens máx — <strong className="text-slate-700">{cloudPct}%</strong>
          </label>
          <input type="range" min={5} max={80} value={cloudPct}
            onChange={e => setCloudPct(Number(e.target.value))} className="w-full accent-violet-500" />
        </div>
      </div>

      <button onClick={run} disabled={running || totalWeight <= 0}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-violet-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A computar composto…</>
          : <><Sliders size={14} /> Calcular Composto Ponderado</>}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={12} className="text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Composto calculado</span>
          </div>
          <div className="text-xs text-emerald-700 font-mono break-all">{result.formula}</div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface GeoAnalisesProps {
  province: string | null;
  district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange?: (d: string | null) => void;
}

export default function GeoAnalises({ province, district, onProvinceChange, onDistrictChange }: GeoAnalisesProps) {
  const [activeTab, setActiveTab]     = useState<SpectralTab>("s2");
  const [opacity, setOpacity]         = useState(0.82);
  const [showS2, setShowS2]           = useState(false);
  const [selectedYear, setSelectedYear] = useState("2022");
  const [geeStatus, setGeeStatus]     = useState<GeeStatus | null>(null);
  const [geeLoading, setGeeLoading]   = useState(false);
  const [geeTile, setGeeTile]         = useState<GeeResult | null>(null);
  const [useGEE, setUseGEE]           = useState(true);
  const [showSetup, setShowSetup]     = useState(false);

  const { data: provinceNames }   = useProvinceNames();
  const { data: provinceGeoJSON } = useProvincesGeoJSON();
  const { data: geologyGeoJSON, isFetching } = useGeologyGeoJSON(
    province, district, "code2006",
    activeTab !== "s2" && !useGEE
  );

  // Fetch GEE status on mount
  const checkGee = useCallback(async () => {
    setGeeLoading(true);
    try {
      const res = await fetch("/geomoz-api/gee/status");
      const data: GeeStatus = await res.json();
      setGeeStatus(data);
      if (!data.connected) setShowSetup(true);
    } catch {
      setGeeStatus({ connected: false, auth_type: null, project: null, message: "API indisponível", indices: [] });
      setShowSetup(true);
    } finally {
      setGeeLoading(false);
    }
  }, []);

  useEffect(() => { checkGee(); }, [checkGee]);

  // Switch to proxy mode automatically if GEE not connected
  useEffect(() => {
    if (geeStatus && !geeStatus.connected) setUseGEE(false);
  }, [geeStatus]);

  // Clear GEE tile when switching index
  useEffect(() => { setGeeTile(null); }, [activeTab]);

  // Synthetic spectral overlay (proxy mode) — disabled for s2/composite/terrain
  const spectralGeoJSON = useMemo(() => {
    if (!geologyGeoJSON || activeTab === "s2" || activeTab === "composite" || useGEE) return null;
    if (GEE_ONLY_INDICES.includes(activeTab as SpectralIndex)) return null;
    const index = activeTab as SpectralIndex;
    return {
      ...geologyGeoJSON,
      features: geologyGeoJSON.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          _spectralColor: applyColormap(
            computeSpectralValue(
              String(f.properties?.Legend ?? f.properties?.LEGEND ?? f.properties?.code2006 ?? ""),
              String(f.properties?.ERA ?? ""),
              String(f.properties?.PERIOD ?? ""),
              index
            ),
            index
          ),
          _spectralValue: computeSpectralValue(
            String(f.properties?.Legend ?? f.properties?.LEGEND ?? f.properties?.code2006 ?? ""),
            String(f.properties?.ERA ?? ""),
            String(f.properties?.PERIOD ?? ""),
            index
          ),
        },
      })),
    };
  }, [geologyGeoJSON, activeTab, useGEE]);

  const activeDef = INDEX_DEFS.find(d => d.id === activeTab);
  const isComposite = activeTab === "composite";
  const isTerrain   = activeDef?.group === "terrain";
  const isGeeOnly   = activeDef && GEE_ONLY_INDICES.includes(activeDef.id);
  const isTopoClass = activeTab === "topo_class";
  const spectralKey = `spectral-${activeTab}-${province}-${district}-${geologyGeoJSON?.features?.length ?? 0}`;
  const geeTileKey  = `gee-${activeTab}-${geeTile?.tileUrl ?? ""}`;

  // District list (cascades from province)
  const { data: districtNames } = useDistrictNames(province);

  // Tabs grouped by category — rendered below with section labels
  const tabGroups: { name: string; tabs: { id: string; label: string; icon: React.ReactNode }[] }[] = [
    { name: "Mosaico",   tabs: [{ id: "s2", label: "Sentinel-2", icon: <Satellite size={13} /> }] },
    { name: "Espectral", tabs: INDEX_DEFS.filter(d => d.group === "spectral").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Landsat",   tabs: INDEX_DEFS.filter(d => d.group === "landsat").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Relevo",    tabs: INDEX_DEFS.filter(d => d.group === "terrain").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Composto",  tabs: [{ id: "composite", label: "Composto", icon: <Sliders size={13} /> }] },
  ];

  const geeReady = geeStatus?.connected && useGEE;
  // Composite & GEE-only indices require GEE — force-toggle if needed
  const requiresGee = isComposite || isGeeOnly;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Module header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Satellite size={17} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm leading-tight">GeoAnálises — Sensoriamento Remoto via Google Earth Engine</h2>
            <p className="text-xs text-slate-400">Sentinel-2 · Landsat 8 · DEM Copernicus GLO-30 · HydroSHEDS · Composto Ponderado</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {geeLoading
            ? <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> A verificar GEE…</span>
            : <GeeStatusBadge status={geeStatus} loading={geeLoading} />}
          {geeStatus?.connected && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
              <span className="text-xs text-slate-500">GEE</span>
              <button
                onClick={() => { setUseGEE(v => !v); setGeeTile(null); }}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${useGEE ? "bg-sky-500" : "bg-slate-300"}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${useGEE ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="text-xs text-slate-500">{useGEE ? "Real" : "Proxy"}</span>
            </div>
          )}
          {!geeStatus?.connected && (
            <button onClick={() => setShowSetup(v => !v)}
              className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors font-medium">
              Configurar GEE
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab bar (grouped) */}
      <div className="bg-white border-b border-slate-200 px-3 flex items-center gap-1 shrink-0 overflow-x-auto">
        {tabGroups.map((grp, gi) => (
          <div key={grp.name} className="flex items-center gap-1 shrink-0">
            {gi > 0 && <span className="text-slate-200 mx-1">·</span>}
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mr-1 hidden md:inline">{grp.name}</span>
            {grp.tabs.map(tab => {
              const isTerrainTab = INDEX_DEFS.find(d => d.id === tab.id)?.group === "terrain";
              const isCompTab = tab.id === "composite";
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as SpectralTab)}
                  className={`flex items-center gap-1.5 px-2.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? isCompTab ? "border-violet-500 text-violet-600"
                      : isTerrainTab ? "border-amber-500 text-amber-600"
                      : "border-sky-500 text-sky-600"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                  }`}>
                  {tab.icon} {tab.label}
                </button>
              );
            })}
          </div>
        ))}
        {geeReady && activeTab !== "s2" && (
          <span className="ml-auto text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full mr-1 shrink-0">
            ✦ GEE Real
          </span>
        )}
        {!geeReady && activeTab !== "s2" && !requiresGee && (
          <span className="ml-auto text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full mr-1 shrink-0">
            Proxy
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Controls sidebar */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">

          {/* GEE Setup Guide (expandable) */}
          {showSetup && (
            <div className="border-b border-slate-200">
              <GeeSetupGuide onRetry={() => { setShowSetup(false); checkGee(); }} />
            </div>
          )}

          {/* Area filter (Province + District) */}
          {!showSetup && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Filtro de Área (Clipping)</h4>
              <div className="space-y-2.5">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Província</label>
                  <div className="relative">
                    <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      value={province ?? ""}
                      onChange={e => { onProvinceChange(e.target.value || null); onDistrictChange?.(null); }}>
                      <option value="">Todas (Moçambique)</option>
                      {provinceNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block flex items-center justify-between">
                    <span>Distrito</span>
                    {!province && <span className="text-[10px] text-slate-300">(seleccione província)</span>}
                  </label>
                  <div className="relative">
                    <select disabled={!province || !onDistrictChange}
                      className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      value={district ?? ""}
                      onChange={e => onDistrictChange?.(e.target.value || null)}>
                      <option value="">Toda a província</option>
                      {districtNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Composite Panel */}
          {!showSetup && isComposite && (
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> O modo composto requer Google Earth Engine. Configure as credenciais primeiro.
                </div>
              ) : (
                <CompositePanel province={province} district={district} onTileReady={setGeeTile} />
              )}
            </div>
          )}

          {/* GEE Analysis Panel (real mode, single index) */}
          {!showSetup && !isComposite && geeReady && activeTab !== "s2" && activeDef && (
            <div className="p-4 border-b border-slate-100">
              <GeeAnalysisPanel
                activeIndex={activeTab as SpectralIndex}
                province={province}
                district={district}
                geeStatus={geeStatus!}
                onTileReady={setGeeTile}
              />
            </div>
          )}

          {/* GEE-only warning when proxy is forced */}
          {!showSetup && !isComposite && !geeReady && isGeeOnly && (
            <div className="p-4 border-b border-slate-100">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <strong>Índice apenas GEE.</strong> {activeDef?.short} requer dados raster reais (DEM / Landsat). Active GEE no topo para calcular.
              </div>
            </div>
          )}

          {/* Proxy mode controls (only spectral indices have meaningful proxy) */}
          {!showSetup && !isComposite && !geeReady && activeTab !== "s2" && !isGeeOnly && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Opacidade</h4>
              <input type="range" min={0.1} max={1} step={0.05} value={opacity}
                onChange={e => setOpacity(Number(e.target.value))} className="w-full accent-sky-500" />
              <div className="text-xs text-slate-400 text-right mt-0.5">{Math.round(opacity * 100)}%</div>
            </div>
          )}

          {/* Sentinel-2 cloudless controls */}
          {!showSetup && activeTab === "s2" && (
            <div className="p-4 border-b border-slate-100 space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sentinel-2 Cloudless (EOX)</h4>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ano do mosaico</label>
                <div className="relative">
                  <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                    {["2022","2021","2020"].map(y => <option key={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showS2} onChange={e => setShowS2(e.target.checked)} className="accent-sky-500" />
                <span className="text-sm text-slate-700">Activar imagem Sentinel-2</span>
              </label>
            </div>
          )}

          {/* Index info */}
          {!showSetup && !isComposite && activeDef && activeTab !== "s2" && (
            <div className="p-4 flex-1 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fórmula</h4>
                <code className="block bg-slate-900 text-emerald-300 text-xs rounded-lg p-2.5 font-mono leading-relaxed">{activeDef.formula}</code>
                <p className="text-xs text-slate-400 mt-1.5">Fonte: {activeDef.bands}</p>
              </div>
              {!geeReady && !isGeeOnly && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Escala (proxy)</h4>
                  <ColormapLegend index={activeTab as SpectralIndex} />
                </div>
              )}
              {isTopoClass && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Classes Topográficas</h4>
                  <div className="space-y-1">
                    {["#1a9850","#66bd63","#fee08b","#fdae61","#a50026","#3690c0"].map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="inline-block w-3.5 h-3.5 rounded" style={{ background: c }} />
                        {TERRAIN_CLASS_NAMES[i]}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Interpretação</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{activeDef.interpretation}</p>
              </div>
              {isTerrain && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1"><Mountain size={12} className="text-amber-600" /><span className="text-xs font-semibold text-amber-700">Análise de Relevo</span></div>
                  <p className="text-xs text-amber-700 leading-relaxed">Baseado no script GEE de referência (Sofala): DEM Copernicus GLO-30 + rios HydroSHEDS, com recorte ao polígono administrativo seleccionado.</p>
                </div>
              )}
              {!geeReady && !isGeeOnly && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1"><Info size={12} className="text-amber-600" /><span className="text-xs font-semibold text-amber-700">Modo Proxy</span></div>
                  <p className="text-xs text-amber-700 leading-relaxed">Estimativa baseada em atributos geológicos. Active GEE para dados raster reais.</p>
                </div>
              )}
            </div>
          )}

          {/* Composite info */}
          {!showSetup && isComposite && (
            <div className="p-4 flex-1 space-y-3">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1"><Sparkles size={12} className="text-violet-600" /><span className="text-xs font-semibold text-violet-700">Composto Ponderado</span></div>
                <p className="text-xs text-violet-700 leading-relaxed">Modelo de favorabilidade multi-critério: combina vegetação, relevo e alteração espectral. Útil para análise integrada de áreas potenciais.</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Escala</h4>
                <div className="h-3 w-full rounded" style={{
                  background: "linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)",
                }} />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>Baixa favorabilidade</span>
                  <span>Alta favorabilidade</span>
                </div>
              </div>
            </div>
          )}

          {/* S2 cloudless info */}
          {!showSetup && activeTab === "s2" && (
            <div className="p-4 flex-1 space-y-3">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5"><Satellite size={12} className="text-sky-600" /><span className="text-xs font-semibold text-sky-700">Sentinel-2 Cloudless EOX</span></div>
                <p className="text-xs text-sky-700 leading-relaxed">Mosaico anual sem nuvens por <a href="https://eox.at" target="_blank" rel="noopener" className="underline">EOX IT Services GmbH</a>. Dados Copernicus modificados. Gratuito e sem autenticação.</p>
              </div>
              {geeStatus?.connected && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><ShieldCheck size={12} className="text-emerald-600" /><span className="text-xs font-semibold text-emerald-700">GEE disponível</span></div>
                  <p className="text-xs text-emerald-700 leading-relaxed">Selecione um índice espectral acima para calcular com Sentinel-2 real via Google Earth Engine.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative overflow-hidden">
          {/* Loading indicators */}
          {isFetching && activeTab !== "s2" && !geeReady && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-white border border-slate-200 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-2 pointer-events-none">
              <Cpu size={13} className="text-sky-500 animate-spin" /> A computar índice proxy…
            </div>
          )}
          {!province && activeTab !== "s2" && !geeReady && (
            <div className="absolute inset-0 z-[300] flex items-center justify-center pointer-events-none">
              <div className="bg-white/95 border border-sky-200 rounded-2xl px-6 py-4 shadow-lg text-center max-w-xs">
                <Layers size={22} className="text-sky-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Selecione uma <strong>província</strong> para calcular o índice espectral proxy.</p>
              </div>
            </div>
          )}

          <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {/* Base tiles */}
            {showS2 || activeTab === "s2" ? (
              <>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" attribution="&copy; OSM &copy; CARTO" maxZoom={19} />
                <WMSTileLayer
                  url="https://tiles.maps.eox.at/wms"
                  layers={`s2cloudless-${selectedYear}`}
                  format="image/jpeg"
                  version="1.1.1"
                  attribution={`Sentinel-2 cloudless ${selectedYear} — EOX IT Services GmbH`}
                  maxZoom={18}
                  opacity={activeTab === "s2" ? 1 : 0.5}
                />
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png" attribution="" maxZoom={19} pane="shadowPane" />
              </>
            ) : (
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OSM &copy; CARTO" maxZoom={19} />
            )}

            <ScaleControl position="bottomleft" imperial={false} />

            {/* Province boundaries */}
            {provinceGeoJSON && (
              <GeoJSON key={`prov-${province}`} data={provinceGeoJSON}
                style={() => ({ color: activeTab === "s2" ? "#ffffff" : "#64748b", weight: 1.2, fillOpacity: 0 })}
                onEachFeature={(f, layer) => {
                  const p = f.properties as Record<string, string>;
                  const name = p?.Provincia || p?.NAME_1 || p?.name || "";
                  if (name) layer.bindTooltip(`<b>${name}</b>`, { sticky: true });
                  layer.on("click", () => {
                    const n = p?.Provincia || p?.NAME_1 || p?.name;
                    if (n) onProvinceChange(n);
                  });
                }}
              />
            )}

            {/* GEE real tile layer (single index or composite) */}
            {(geeReady || isComposite) && geeTile && activeTab !== "s2" && (
              <TileLayer
                key={geeTileKey}
                url={geeTile.tileUrl}
                attribution={`GEE · ${geeTile.name}`}
                opacity={opacity}
                maxZoom={18}
              />
            )}

            {/* Proxy spectral overlay */}
            {!geeReady && activeTab !== "s2" && spectralGeoJSON && (
              <GeoJSON key={spectralKey} data={spectralGeoJSON as GeoJSON.FeatureCollection}
                style={(f) => ({
                  color: "rgba(255,255,255,0.2)", weight: 0.3,
                  fillColor: (f?.properties as Record<string, string>)?._spectralColor ?? "#64748b",
                  fillOpacity: opacity,
                })}
                onEachFeature={(f, layer) => {
                  const p = f.properties as Record<string, string & number>;
                  const legend = p?.Legend ?? p?.LEGEND ?? p?.code2006 ?? "Unknown";
                  const val = Number(p._spectralValue ?? 0);
                  layer.bindTooltip(
                    `<b>${legend}</b><br/>${activeDef?.short}: <b>${(val * 100).toFixed(0)}%</b><br/>ERA: ${p?.ERA ?? "—"} · PERIOD: ${p?.PERIOD ?? "—"}`,
                    { sticky: true }
                  );
                }}
              />
            )}
          </MapContainer>

          {/* Map overlay legend — proxy mode */}
          {activeTab !== "s2" && !isComposite && !geeReady && !isGeeOnly && activeDef && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3 w-52 pointer-events-none">
              <div className="text-xs font-semibold text-slate-700 mb-1.5">{activeDef.label} (Proxy)</div>
              <div className="h-3 w-full rounded" style={{
                background: `linear-gradient(to right, ${Array.from({ length: 8 }, (_, i) => applyColormap(i / 7, activeDef.id as SpectralIndex)).join(", ")})`,
              }} />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>{activeDef.lowLabel.split("/")[0]}</span>
                <span>{activeDef.highLabel.split("/")[0]}</span>
              </div>
            </div>
          )}
          {/* GEE / Composite result badge */}
          {activeTab !== "s2" && geeTile && (geeReady || isComposite) && (
            <div className={`absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border p-3 w-64 pointer-events-none ${
              isComposite ? "border-violet-200" : "border-emerald-200"
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={12} className={isComposite ? "text-violet-500" : "text-emerald-500"} />
                <div className={`text-xs font-semibold ${isComposite ? "text-violet-700" : "text-emerald-700"}`}>
                  {isComposite ? "Composto Ponderado GEE" : "GEE Real"}
                </div>
              </div>
              <div className="text-xs text-slate-500">{geeTile.name.split("—")[0].trim()}</div>
              {geeTile.sceneCount > 0 && (
                <div className="text-xs text-slate-400">{geeTile.sceneCount} cenas · {geeTile.dateRange}</div>
              )}
              {isTopoClass && (
                <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {["#1a9850","#66bd63","#fee08b","#fdae61","#a50026","#3690c0"].map((c, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rounded shrink-0" style={{ background: c }} />
                      <span className="truncate">{TERRAIN_CLASS_NAMES[i]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-4 text-xs text-slate-400">
        <span>
          {activeTab === "s2"
            ? `Sentinel-2 cloudless ${selectedYear} — EOX IT Services (CC BY 4.0)`
            : isComposite && geeTile
              ? `Composto Ponderado · ${geeTile.formula}`
              : geeReady && geeTile
                ? `GEE Real · ${geeTile.formula}${geeTile.sceneCount ? ` · ${geeTile.sceneCount} cenas` : ""}`
                : `${isGeeOnly ? "GEE necessário" : "Proxy"} · ${activeDef?.formula ?? ""}`}
        </span>
        {province && (
          <span className="ml-auto text-sky-500 font-medium">
            {province}{district ? ` / ${district}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

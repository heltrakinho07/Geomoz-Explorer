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
} from "lucide-react";

import { useGeologyGeoJSON, useProvincesGeoJSON, useProvinceNames } from "@/hooks/useGeoMoz";
import { computeSpectralValue, applyColormap, SpectralIndex } from "@/lib/geoml";

// ── Types ─────────────────────────────────────────────────────────────────────

type SpectralTab = "s2" | SpectralIndex;

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
  id: SpectralTab;
  label: string;
  short: string;
  icon: React.ReactNode;
  formula: string;
  bands: string;
  interpretation: string;
  lowLabel: string;
  highLabel: string;
}

const INDEX_DEFS: IndexDef[] = [
  {
    id: "ndvi",
    label: "NDVI",
    short: "Vegetação",
    icon: <CloudSun size={13} />,
    formula: "NDVI = (B8 − B4) / (B8 + B4)",
    bands: "NIR (B8) · Vermelho (B4)",
    interpretation: "Valores > 0.5 indicam cobertura vegetal densa (depósitos quaternários, aluviões). Valores negativos = rocha exposta, água.",
    lowLabel: "Rocha / solo",
    highLabel: "Vegetação densa",
  },
  {
    id: "fe_oxide",
    label: "Fe-Óxidos",
    short: "Fe-Óxidos",
    icon: <Flame size={13} />,
    formula: "Fe-Oxide = B4 / B2",
    bands: "Vermelho (B4) · Azul (B2)",
    interpretation: "Detecta BIF, laterite e gossã sobre sulfuretos. Fundamental para prospecção de Fe, Mn e zonas de oxidação.",
    lowLabel: "Rocha fresca",
    highLabel: "BIF / laterite / gossã",
  },
  {
    id: "clay",
    label: "Argilas",
    short: "Argilas",
    icon: <Droplets size={13} />,
    formula: "Clay = B11 / B8A",
    bands: "SWIR1 (B11) · Red-Edge3 (B8A)",
    interpretation: "Minerais argilosos (caulinite, esmectite, illite). Mapeia saprolite, horizontes de intemperismo e zonas de alteração argílica.",
    lowLabel: "Quartzo / rocha fresca",
    highLabel: "Argilas / xisto / saprolite",
  },
  {
    id: "hydrothermal",
    label: "Hidrotermal",
    short: "Hidrotermal",
    icon: <FlaskConical size={13} />,
    formula: "(B11+B4) / (B8A+B3)",
    bands: "SWIR1 (B11) · B4 · Red-Edge3 (B8A) · Verde (B3)",
    interpretation: "Zonas de alteração hidrotermal (silicificação, sericitização, argilização). Crítico para prospecção de Au, Ag, Cu, Mo.",
    lowLabel: "Sem alteração",
    highLabel: "Skarn / greisen / alteração intensa",
  },
  {
    id: "bare_soil",
    label: "Solo Exposto",
    short: "BSI",
    icon: <BarChart2 size={13} />,
    formula: "(B11+B4−B8−B2) / (B11+B4+B8+B2)",
    bands: "B11 · B4 · NIR (B8) · Azul (B2)",
    interpretation: "Zonas de solo exposto e erosão. Mapeia áreas de mineração activa e monitorização de uso do solo.",
    lowLabel: "Vegetação / escuro",
    highLabel: "Solo / rocha exposta",
  },
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
  activeIndex, province, geeStatus, onTileReady,
}: {
  activeIndex: SpectralIndex;
  province: string | null;
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
            <label className="text-xs text-slate-500 mb-1 block">Área de análise</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">
              {province ?? "Moçambique (completo)"}
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

// ── Main Component ─────────────────────────────────────────────────────────────

interface GeoAnalisesProps {
  province: string | null;
  district: string | null;
  onProvinceChange: (p: string | null) => void;
}

export default function GeoAnalises({ province, district, onProvinceChange }: GeoAnalisesProps) {
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

  // Synthetic spectral overlay (proxy mode)
  const spectralGeoJSON = useMemo(() => {
    if (!geologyGeoJSON || activeTab === "s2" || useGEE) return null;
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
  const spectralKey = `spectral-${activeTab}-${province}-${district}-${geologyGeoJSON?.features?.length ?? 0}`;
  const geeTileKey  = `gee-${activeTab}-${geeTile?.tileUrl ?? ""}`;

  const tabs = [
    { id: "s2",           label: "Sentinel-2",  icon: <Satellite size={13} /> },
    ...INDEX_DEFS.map(d => ({ id: d.id, label: d.short, icon: d.icon })),
  ] as { id: string; label: string; icon: React.ReactNode }[];

  const geeReady = geeStatus?.connected && useGEE;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Module header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Satellite size={17} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm leading-tight">GeoAnálises — Sentinel-2 via Google Earth Engine</h2>
            <p className="text-xs text-slate-400">NDVI · Fe-Óxidos · Argilas · Alteração Hidrotermal · BSI</p>
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

      {/* Sub-tab bar */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-1 shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as SpectralTab)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
        {geeReady && activeTab !== "s2" && (
          <span className="ml-auto text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full mr-1 shrink-0">
            ✦ Modo GEE Real
          </span>
        )}
        {!geeReady && activeTab !== "s2" && (
          <span className="ml-auto text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full mr-1 shrink-0">
            Proxy Geológico
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

          {/* Province filter */}
          {!showSetup && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Filtro de Área</h4>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Província</label>
                <div className="relative">
                  <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={province ?? ""} onChange={e => onProvinceChange(e.target.value || null)}>
                    <option value="">Todas</option>
                    {provinceNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {/* GEE Analysis Panel (real mode) */}
          {!showSetup && geeReady && activeTab !== "s2" && activeDef && (
            <div className="p-4 border-b border-slate-100">
              <GeeAnalysisPanel
                activeIndex={activeTab as SpectralIndex}
                province={province}
                geeStatus={geeStatus!}
                onTileReady={setGeeTile}
              />
            </div>
          )}

          {/* Proxy mode controls */}
          {!showSetup && !geeReady && activeTab !== "s2" && (
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
          {!showSetup && activeDef && activeTab !== "s2" && (
            <div className="p-4 flex-1 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fórmula Sentinel-2</h4>
                <code className="block bg-slate-900 text-emerald-300 text-xs rounded-lg p-2.5 font-mono leading-relaxed">{activeDef.formula}</code>
                <p className="text-xs text-slate-400 mt-1.5">Bandas: {activeDef.bands}</p>
              </div>
              {!geeReady && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Escala (proxy)</h4>
                  <ColormapLegend index={activeTab as SpectralIndex} />
                </div>
              )}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Interpretação</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{activeDef.interpretation}</p>
              </div>
              {!geeReady && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1"><Info size={12} className="text-amber-600" /><span className="text-xs font-semibold text-amber-700">Modo Proxy</span></div>
                  <p className="text-xs text-amber-700 leading-relaxed">Estimativa baseada em atributos geológicos (Legend, ERA, PERIOD). Configure GEE para dados Sentinel-2 reais.</p>
                </div>
              )}
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

            {/* GEE real tile layer */}
            {geeReady && geeTile && activeTab !== "s2" && (
              <TileLayer
                key={geeTileKey}
                url={geeTile.tileUrl}
                attribution={`GEE Sentinel-2 · ${geeTile.name}`}
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

          {/* Map overlay legend */}
          {activeTab !== "s2" && !geeReady && activeDef && (
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
          {activeTab !== "s2" && geeReady && geeTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-emerald-200 p-3 w-60 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <div className="text-xs font-semibold text-emerald-700">GEE Sentinel-2 Real</div>
              </div>
              <div className="text-xs text-slate-500">{geeTile.name.split("—")[0].trim()}</div>
              <div className="text-xs text-slate-400">{geeTile.sceneCount} cenas · {geeTile.dateRange}</div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-4 text-xs text-slate-400">
        <span>
          {activeTab === "s2"
            ? `Sentinel-2 cloudless ${selectedYear} — EOX IT Services (CC BY 4.0)`
            : geeReady && geeTile
              ? `GEE Real · ${geeTile.formula} · ${geeTile.sceneCount} cenas Sentinel-2`
              : `Proxy geológico · ${activeDef?.formula ?? ""}`}
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

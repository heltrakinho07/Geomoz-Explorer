/**
 * GeoMoz AI — Geological Machine Learning Module.
 *
 * Implemented features:
 *  - K-Means geological clustering (pure TS, runs in browser)
 *  - PCA 2-component projection (visualization)
 *  - Mineral favorability scoring (knowledge-based, extensible)
 *  - Multi-mineral favorability maps
 *  - Province ranking tables
 *
 * Architecture ready for:
 *  - WebWorker offloading (heavy ML runs)
 *  - Random Forest / XGBoost (via ONNX Runtime Web)
 *  - Server-side scikit-learn inference via API
 */

import { useState, useMemo } from "react";
import {
  MapContainer, TileLayer, GeoJSON, ScaleControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  BrainCircuit, GitBranch, Map, BarChart2, Loader2, Info,
  ChevronDown, Play, Target, Star, TrendingUp, Cpu,
} from "lucide-react";

import { useProvinceSummary, useProvincesGeoJSON, ProvinceSummaryItem } from "@/hooks/useGeoMoz";
import {
  kmeans, normalize, pca2, scoreFavorability,
  FavorabilityResult, MineralType, KMeansResult,
} from "@/lib/geoml";

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

const MINERAL_OPTIONS: { value: MineralType; label: string; icon: string; desc: string }[] = [
  { value: "gold",           label: "Ouro (Au)",            icon: "🥇", desc: "Greenstone belts, BIF, shear zones" },
  { value: "gemstones",      label: "Pedras Preciosas",     icon: "💎", desc: "Mármore, calc-silicato, pegmatito" },
  { value: "coal",           label: "Carvão (Coke)",        icon: "⚫", desc: "Karoo/Gondwana permo-carbonífero" },
  { value: "graphite",       label: "Grafite",              icon: "◼", desc: "Gneisse Pré-câmbrico, xisto, granulito" },
  { value: "heavy_minerals", label: "Minerais Pesados",     icon: "🏖", desc: "Aluvião quaternário, depósitos costeiros" },
  { value: "base_metals",    label: "Metais Base (Cu/Ni)",  icon: "🔩", desc: "Máficas/ultramáficas, ofiolitos" },
  { value: "hydrocarbons",   label: "Hidrocarbonetos",      icon: "🛢", desc: "Bacias mesozoicas, calcário, evaporite" },
];

type AITab = "clustering" | "favorability" | "pca" | "about";

// ── Helper: province name from GeoJSON feature ─────────────────────────────────

function getProvinceName(feature: GeoJSON.Feature): string {
  const p = feature.properties as Record<string, string>;
  return p?.Provincia || p?.PROVINCIA || p?.NAME_1 || p?.name || "";
}

// ── Sub-tab: Clustering ────────────────────────────────────────────────────────

function ClusteringTab({ summaryItems }: { summaryItems: ProvinceSummaryItem[] }) {
  const [k, setK] = useState(3);
  const [result, setResult] = useState<(KMeansResult & { provinceLabels: Record<string, number> }) | null>(null);
  const [running, setRunning] = useState(false);
  const { data: provinceGeoJSON } = useProvincesGeoJSON();

  function runClustering() {
    setRunning(true);
    setTimeout(() => {
      const features = summaryItems.map(p => [p.totalFeatures, p.totalUnits, p.totalAreaKm2]);
      const { data: norm } = normalize(features);
      const res = kmeans(norm, k);
      const provinceLabels: Record<string, number> = {};
      summaryItems.forEach((p, i) => { provinceLabels[p.province] = res.labels[i]; });
      setResult({ ...res, provinceLabels });
      setRunning(false);
    }, 50);
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
      {/* Controls */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Parâmetros K-Means</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Número de clusters (K) — <strong className="text-slate-700">{k}</strong>
              </label>
              <input type="range" min={2} max={Math.min(summaryItems.length, 6)} value={k}
                onChange={e => setK(Number(e.target.value))}
                className="w-full accent-sky-500" />
              <div className="flex justify-between text-xs text-slate-400">
                <span>2</span><span>{Math.min(summaryItems.length, 6)}</span>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
              <div><strong>Features usadas:</strong></div>
              <div>· Feições totais</div>
              <div>· Unidades geológicas</div>
              <div>· Área total (km²)</div>
            </div>
          </div>
          <button
            onClick={runClustering}
            disabled={running}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-sky-200"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? "A executar…" : "Executar Clustering"}
          </button>
        </div>

        {result && (
          <div className="p-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Métricas do Modelo</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Inércia</span>
                <span className="font-semibold text-slate-800">{result.inertia.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Silhueta</span>
                <span className={`font-semibold ${result.silhouette > 0.5 ? "text-emerald-600" : result.silhouette > 0.25 ? "text-amber-600" : "text-slate-600"}`}>
                  {result.silhouette.toFixed(3)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Iterações</span>
                <span className="font-semibold text-slate-800">{result.iterations}</span>
              </div>
            </div>

            {/* Cluster legend */}
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

      {/* Map */}
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
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OSM &copy; CARTO" maxZoom={19}
          />
          <ScaleControl position="bottomleft" imperial={false} />
          {provinceGeoJSON && (
            <GeoJSON
              key={clusterKey}
              data={provinceGeoJSON}
              style={(f) => {
                const name = getProvinceName(f!);
                const label = result?.provinceLabels?.[name] ?? -1;
                return {
                  color: "#ffffff",
                  weight: 1.5,
                  fillColor: label >= 0 ? CLUSTER_COLORS[label % CLUSTER_COLORS.length] : "#e2e8f0",
                  fillOpacity: label >= 0 ? 0.72 : 0.2,
                };
              }}
              onEachFeature={(f, layer) => {
                const name = getProvinceName(f);
                const label = result?.provinceLabels?.[name] ?? -1;
                const pdata = summaryItems.find(p => p.province === name);
                layer.bindTooltip(
                  `<b>${name}</b>${label >= 0 ? `<br/>Cluster ${label + 1}` : ""}` +
                  (pdata ? `<br/>Unidades: ${pdata.totalUnits} · Área: ${pdata.totalAreaKm2.toLocaleString()} km²` : ""),
                  { sticky: true }
                );
              }}
            />
          )}
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
    summaryItems.map(p => scoreFavorability(p.province, p.lithologies, p.eras, p.periods, mineral))
      .sort((a, b) => b.score - a.score),
    [summaryItems, mineral]
  );

  const resultMap = useMemo(() => {
    const m: Record<string, FavorabilityResult> = {};
    results.forEach(r => { m[r.province] = r; });
    return m;
  }, [results]);

  const maxScore = Math.max(...results.map(r => r.score), 0.01);
  const favKey = `fav-${mineral}`;

  const classColor: Record<string, string> = {
    "Alta": "text-red-600 bg-red-50",
    "Moderada": "text-amber-600 bg-amber-50",
    "Baixa": "text-sky-600 bg-sky-50",
    "Muito Baixa": "text-slate-500 bg-slate-50",
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Controls + ranking */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0overflow-y-auto">
        <div className="p-4 border-b border-slate-100 shrink-0">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tipo de Mineral</h4>
          <div className="space-y-1.5">
            {MINERAL_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors ${
                  mineral === opt.value ? "bg-sky-50 border border-sky-200" : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <input type="radio" name="mineral" value={opt.value} checked={mineral === opt.value}
                  onChange={() => setMineral(opt.value)} className="sr-only" />
                <span className="text-base">{opt.icon}</span>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${mineral === opt.value ? "text-sky-700" : "text-slate-700"}`}>{opt.label}</div>
                  <div className="text-xs text-slate-400 truncate">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Ranking */}
        <div className="flex-1 overflow-y-auto p-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Ranking de Províncias</h4>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={r.province} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{r.province}</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${classColor[r.classification]}`}>
                    {r.classification}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(r.score / maxScore) * 100}%`, background: FAVORABILITY_GRADIENT(r.score) }} />
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

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute bottom-8 left-4 z-[500] bg-white/95 border border-slate-200 rounded-xl shadow-lg p-3 w-52 pointer-events-none">
          <div className="text-xs font-semibold text-slate-700 mb-1.5">Favorabilidade — {MINERAL_OPTIONS.find(m => m.value === mineral)?.label}</div>
          <div className="h-3 w-full rounded" style={{
            background: `linear-gradient(to right, ${
              Array.from({ length: 8 }, (_, i) => FAVORABILITY_GRADIENT(i / 7)).join(", ")
            })`,
          }} />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Muito Baixa</span><span>Alta</span>
          </div>
        </div>

        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OSM &copy; CARTO" maxZoom={19} />
          <ScaleControl position="bottomleft" imperial={false} />
          {provinceGeoJSON && (
            <GeoJSON
              key={favKey}
              data={provinceGeoJSON}
              style={(f) => {
                const name = getProvinceName(f!);
                const r = resultMap[name];
                return {
                  color: "#ffffff",
                  weight: 1.5,
                  fillColor: r ? FAVORABILITY_GRADIENT(r.score) : "#e2e8f0",
                  fillOpacity: r ? Math.max(0.15, r.score * 0.85) : 0.2,
                };
              }}
              onEachFeature={(f, layer) => {
                const name = getProvinceName(f);
                const r = resultMap[name];
                layer.bindTooltip(
                  `<b>${name}</b><br/>` +
                  (r ? `Favorabilidade: <b>${r.classification}</b> (${(r.score * 100).toFixed(0)}%)<br/>` +
                       `Evidências: ${r.matchedKeywords.slice(0, 3).join(", ")}` : "Sem dados"),
                  { sticky: true }
                );
              }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Sub-tab: PCA ───────────────────────────────────────────────────────────────

function PCATab({ summaryItems }: { summaryItems: ProvinceSummaryItem[] }) {
  const { projected, explained } = useMemo(() => {
    const features = summaryItems.map(p => [p.totalFeatures, p.totalUnits, p.totalAreaKm2]);
    const { data: norm } = normalize(features);
    return pca2(norm);
  }, [summaryItems]);

  if (!projected.length) return null;

  const xs = projected.map(p => p[0]);
  const ys = projected.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 540, H = 360, PAD = 40;

  function toSvgX(v: number) { return PAD + ((v - minX) / (maxX - minX + 0.0001)) * (W - PAD * 2); }
  function toSvgY(v: number) { return H - PAD - ((v - minY) / (maxY - minY + 0.0001)) * (H - PAD * 2); }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Análise de Componentes Principais (PCA 2D)</h3>
        <p className="text-sm text-slate-500 mb-4">
          PC1 explica <strong>{explained[0]}%</strong> · PC2 explica <strong>{explained[1]}%</strong> da variância total.
          Features: feições, unidades geológicas, área (km²).
        </p>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* Grid */}
            {Array.from({ length: 5 }, (_, i) => (
              <line key={`hg${i}`} x1={PAD} y1={PAD + i * (H - PAD * 2) / 4} x2={W - PAD} y2={PAD + i * (H - PAD * 2) / 4}
                stroke="#f1f5f9" strokeWidth="1" />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <line key={`vg${i}`} x1={PAD + i * (W - PAD * 2) / 4} y1={PAD} x2={PAD + i * (W - PAD * 2) / 4} y2={H - PAD}
                stroke="#f1f5f9" strokeWidth="1" />
            ))}
            {/* Axis */}
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#e2e8f0" strokeWidth="1.5" />
            {/* Labels */}
            <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">PC1 ({explained[0]}%)</text>
            <text x={12} y={H / 2} textAnchor="middle" fontSize="11" fill="#94a3b8" transform={`rotate(-90,12,${H / 2})`}>PC2 ({explained[1]}%)</text>
            {/* Points */}
            {summaryItems.map((p, i) => {
              const cx = toSvgX(projected[i][0]);
              const cy = toSvgY(projected[i][1]);
              return (
                <g key={p.province}>
                  <circle cx={cx} cy={cy} r={8} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} opacity={0.85} />
                  <text x={cx} y={cy - 11} textAnchor="middle" fontSize="9" fill="#475569" fontWeight="600">
                    {p.province.length > 10 ? p.province.slice(0, 9) + "…" : p.province}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">
          Visualização 2D das províncias no espaço PCA. Províncias próximas têm composição geológica similar.
        </p>
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
    { done: false, item: "Random Forest via ONNX Runtime Web (modelo pré-treinado em Python)" },
    { done: false, item: "XGBoost via servidor Python scikit-learn / xgboost API" },
    { done: false, item: "Integração com base de dados de ocorrências minerais" },
    { done: false, item: "Deep learning (CNN) sobre imagens Sentinel-2 para litologia automática" },
    { done: false, item: "Análise multivariada: composição litológica × estrutural × gravimétrica" },
    { done: false, item: "WebWorker offloading para cálculos pesados" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl flex items-center justify-center">
              <BrainCircuit size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">GeoMoz AI Engine</h2>
              <p className="text-sm text-slate-500">Módulo de inteligência artificial geológica</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            O GeoMoz AI Engine aplica algoritmos de aprendizagem automática directamente sobre dados geológicos
            de Moçambique, sem necessidade de infraestrutura externa. Todo o cálculo corre no browser.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Cpu size={14} className="text-violet-500" /> Metodologia de Favorabilidade Mineral
          </h3>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600 leading-relaxed">
            <p className="mb-2">O algoritmo de scoring baseia-se numa base de conhecimento geológico sobre associações minerais conhecidas em Moçambique e em contextos geológicos globais:</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Para cada província, extrai-se a lista de litologias, eras e períodos geológicos (API <code className="text-xs bg-slate-100 px-1 rounded">/province-summary</code>)</li>
              <li>Compara-se com um dicionário de palavras-chave por tipo de mineral com pesos de 0–1</li>
              <li>O score final é a média dos pesos das palavras-chave encontradas, capado em 1.0</li>
              <li>Classificação: Alta (≥75%) · Moderada (50–74%) · Baixa (25–49%) · Muito Baixa (&lt;25%)</li>
            </ol>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-sky-500" /> Roadmap de IA
          </h3>
          <div className="space-y-2">
            {roadmap.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 bg-white border border-slate-100 rounded-lg">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.done ? "bg-emerald-100" : "bg-slate-100"}`}>
                  <span className={`text-xs ${item.done ? "text-emerald-600" : "text-slate-400"}`}>
                    {item.done ? "✓" : "○"}
                  </span>
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
    { id: "about",        label: "Sobre / Roadmap",       icon: <Info size={13} /> },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm">
            <BrainCircuit size={17} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm leading-tight">GeoMoz AI — Motor de Inteligência Artificial</h2>
            <p className="text-xs text-slate-400">K-Means · PCA · Favorabilidade mineral · Extensível para Random Forest / XGBoost</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-medium">
            β — Em desenvolvimento activo
          </span>
          {summaryItems.length > 0 && (
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">
              {summaryItems.length} províncias carregadas
            </span>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-1 shrink-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-violet-500 text-violet-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Load data gate */}
      {!loadEnabled && activeTab !== "about" ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm text-center shadow-sm">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BrainCircuit size={26} className="text-violet-500" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Carregar Dados de Províncias</h3>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              O módulo AI precisa dos dados geológicos de todas as províncias para análise.
              A primeira execução pode demorar 15–30 s (join espacial completo). Resultados em cache depois.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 mb-4 text-left">
              <strong>Nota:</strong> Os dados serão calculados pelo servidor Python e mantidos em cache até reinício.
            </div>
            <button
              onClick={() => setLoadEnabled(true)}
              className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm shadow-violet-200"
            >
              <Star size={14} className="inline mr-2" />
              Iniciar Análise AI
            </button>
          </div>
        </div>
      ) : isLoading && activeTab !== "about" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center">
            <Loader2 size={26} className="text-violet-500 animate-spin" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">A processar dados geológicos…</p>
            <p className="text-sm text-slate-400 mt-1">Join espacial de todas as províncias · Pode demorar 15–30 s</p>
          </div>
          <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      ) : error && activeTab !== "about" ? (
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

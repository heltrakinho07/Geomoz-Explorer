/**
 * DashboardPanel — integrated overview of all GeoMoz modules with quick export.
 *
 * Provides:
 *  - Summary cards for each module with key metrics
 *  - Quick-export buttons for combined analysis results
 *  - System status overview
 *  - One-click report generation
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Satellite, Mountain, Droplets, Flame,
  Waves, Navigation, Building2, Activity,
  Download, Loader2, CheckCircle2, Sprout,
  FileText, BarChart2, Layers,
  ExternalLink, RefreshCw,
} from "lucide-react";
import { apiUrl, apiFetch } from "@/lib/api";
import type { Stats } from "@/hooks/useGeoMoz";

interface DashboardPanelProps {
  province: string | null;
  district: string | null;
}

interface ModuleCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  status: "active" | "requires_data" | "requires_gee";
  indexCount: number;
}

interface GeeStatus {
  connected: boolean;
  auth_type: string | null;
  project: string | null;
  message: string;
}

interface GeeIndexInfo {
  id: string;
  group: string;
  name: string;
  formula: string;
}

const MODULES: ModuleCard[] = [
  { id: "geology", name: "Geologia & Mapa", description: "Visualização geológica, litologias, províncias e distritos",
    icon: <Globe size={18} />, color: "text-sky-600", bgColor: "bg-sky-50", status: "active", indexCount: 0 },
  { id: "spectral", name: "Sensoriamento Remoto", description: "NDVI, Fe-Óxidos, Argilas, Hidrotermal, BSI, Al-OH, Ferroso, Gossan",
    icon: <Satellite size={18} />, color: "text-emerald-600", bgColor: "bg-emerald-50", status: "requires_gee", indexCount: 0 },
  { id: "terrain", name: "Relevo & Morfologia", description: "Elevação, Hipsometria, Declive, Hillshade, Classes Topo, Perfil, Curvas",
    icon: <Mountain size={18} />, color: "text-amber-600", bgColor: "bg-amber-50", status: "requires_gee", indexCount: 0 },
  { id: "agriculture", name: "Agricultura", description: "EVI, NDMI, SAVI, GCI, MSAVI2, Saúde Culturas",
    icon: <BarChart2 size={18} />, color: "text-green-600", bgColor: "bg-green-50", status: "requires_gee", indexCount: 0 },
  { id: "drought", name: "Seca & Stress Hídrico", description: "NDDI, Severidade de Seca",
    icon: <Flame size={18} />, color: "text-orange-600", bgColor: "bg-orange-50", status: "requires_gee", indexCount: 0 },
  { id: "fire", name: "Incêndios & Desflorestação", description: "NBR, dNBR, Severidade, Hansen, MODIS BA, Risco",
    icon: <Flame size={18} />, color: "text-red-600", bgColor: "bg-red-50", status: "requires_gee", indexCount: 0 },
  { id: "coastal", name: "Zonas Costeiras & Marinhas", description: "Mangal, Índice Costeiro, Erosão, Tsunami",
    icon: <Waves size={18} />, color: "text-cyan-600", bgColor: "bg-cyan-50", status: "requires_gee", indexCount: 0 },
  { id: "climate", name: "Clima & Desastres", description: "Precipitação, Temperatura, Rotas Ciclones, Risco Ciclone",
    icon: <Navigation size={18} />, color: "text-violet-600", bgColor: "bg-violet-50", status: "requires_gee", indexCount: 0 },
  { id: "urban", name: "Urbano & Infraestruturas", description: "Expansão Urbana, Impermeável, Ilha Calor",
    icon: <Building2 size={18} />, color: "text-stone-600", bgColor: "bg-stone-50", status: "requires_gee", indexCount: 0 },
  { id: "health", name: "Saúde Pública", description: "Risco Malária, Acesso Saúde, Saneamento, Risco Epidémico",
    icon: <Activity size={18} />, color: "text-rose-600", bgColor: "bg-rose-50", status: "requires_gee", indexCount: 0 },
  { id: "water", name: "Água & Turbidez", description: "NDTI, Qualidade Água",
    icon: <Droplets size={18} />, color: "text-blue-600", bgColor: "bg-blue-50", status: "requires_gee", indexCount: 0 },
  { id: "biophysical", name: "Biofísicos", description: "LAI, Altura dossel",
    icon: <Sprout size={18} />, color: "text-teal-600", bgColor: "bg-teal-50", status: "requires_gee", indexCount: 0 },
];

/**
 * Maps each module id to one or more GEE index groups.
 * The backend defines groups in INDEX_REGISTRY inside gee_presets.py.
 */
const MODULE_GROUP_MAP: Record<string, string[]> = {
  spectral:    ["spectral"],
  terrain:     ["terrain", "landsat"],
  agriculture: ["agriculture"],
  drought:     ["drought"],
  fire:        ["fire"],
  coastal:     ["coastal"],
  climate:     ["climate"],
  urban:       ["urban"],
  health:      ["health"],
  water:       ["water"],
  biophysical: ["biophysical"],
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

const MZ_AREA = 801_590;

export default function DashboardPanel({ province, district }: DashboardPanelProps) {
  const qc = useQueryClient();
  const [geeStatus, setGeeStatus] = useState<GeeStatus | null>(null);
  const [geeLoading, setGeeLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // ── Dynamic index counts from the API ──────────────────────────────────

  const { data: indicesData, isLoading: indicesLoading } = useQuery<{ indices: GeeIndexInfo[] }>({
    queryKey: ["gee-indices"],
    queryFn: () => apiFetch("/geomoz-api/gee/indices")).then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (indicesData?.indices ?? []).forEach(idx => {
      counts[idx.group] = (counts[idx.group] || 0) + 1;
    });
    return counts;
  }, [indicesData]);

  function getIndexCount(moduleId: string): number {
    const groups = MODULE_GROUP_MAP[moduleId];
    if (!groups) return 0;
    return groups.reduce((sum, g) => sum + (groupCounts[g] || 0), 0);
  }

  const totalIndices = useMemo(
    () => MODULES.reduce((acc, m) => acc + getIndexCount(m.id), 0),
    [groupCounts]
  );

  // ── GEE status check ───────────────────────────────────────────────────

  const title = district ? `${district}, ${province}` : province ?? "Moçambique";

  function getStats() { return qc.getQueryData<Stats>(["stats", province, district]); }

  const checkGee = useCallback(async () => {
    setGeeLoading(true);
    try {
      const res = await apiFetch("/geomoz-api/gee/status"));
      const data = await res.json() as GeeStatus & { indices?: string[] };
      setGeeStatus(data);
    } catch {
      setGeeStatus({ connected: false, auth_type: null, project: null, message: "API indisponível" });
    } finally {
      setGeeLoading(false);
    }
  }, []);

  useEffect(() => { checkGee(); }, [checkGee]);

  // Generate a combined JSON report of all current analysis data
  function handleExportReport() {
    setExporting("report");
    try {
      const stats = getStats();
      const report = {
        metadata: {
          title: "GeoMoz Explorer — Relatório Integrado",
          area: title,
          province,
          district,
          generatedAt: new Date().toISOString(),
          geeConnected: geeStatus?.connected ?? false,
          totalIndices,
        },
        geology: stats ? {
          totalFeatures: stats.totalFeatures,
          totalUnits: stats.totalUnits,
          totalAreaKm2: stats.totalAreaKm2,
          dominant: stats.dominant,
          lithologies: stats.lithologies.map(l => ({
            name: l.name,
            color: l.color,
            areaKm2: l.areaKm2,
            percent: l.percent,
          })),
          coveragePct: ((stats.totalAreaKm2 / MZ_AREA) * 100).toFixed(2),
        } : null,
        modules: MODULES.map(m => ({
          name: m.name,
          indices: getIndexCount(m.id),
          status: m.status,
        })),
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Relatorio_${province ?? "Mocambique"}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error", e);
    } finally {
      setExporting(null);
    }
  }

  // Export current index list as CSV (async)
  async function handleExportIndices() {
    setExporting("indices");
    try {
      const res = await apiFetch("/geomoz-api/gee/indices"));
      const data = await res.json() as { indices: GeeIndexInfo[] };
      const indices = data.indices ?? [];
      const rows = [
        ["id", "grupo", "nome", "formula"],
        ...indices.map((i: GeeIndexInfo) => [
          i.id, i.group,
          `"${(i.name ?? "").replace(/"/g, '""')}"`,
          `"${(i.formula ?? "").replace(/"/g, '""')}"`,
        ]),
      ];
      const csv = rows.map(r => r.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Indices_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Indices export error", e);
    } finally {
      setExporting(null);
    }
  }

  // ── Geology stats ──
  const stats = getStats();
  const countLabel = indicesLoading ? "…" : String(totalIndices);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Dashboard GeoMoz</h2>
              <p className="text-sm text-slate-500 mt-1">
                Visão geral integrada de todos os módulos de análise e exportação.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                geeLoading ? "text-slate-400 border-slate-200 bg-slate-50" :
                geeStatus?.connected ? "text-emerald-700 border-emerald-200 bg-emerald-50" :
                "text-amber-700 border-amber-200 bg-amber-50"
              }`}>
                {geeLoading ? (
                  <><Loader2 size={10} className="animate-spin" /> GEE…</>
                ) : geeStatus?.connected ? (
                  <><CheckCircle2 size={10} /> GEE Conectado</>
                ) : (
                  <><RefreshCw size={10} /> GEE Offline</>
                )}
              </div>
              <button
                onClick={checkGee}
                className="text-xs text-sky-500 hover:text-sky-700 p-1 rounded-md hover:bg-sky-50"
                title="Actualizar estado GEE"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Active area stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl p-4 text-white shadow-sm">
              <div className="text-[10px] opacity-80 uppercase tracking-wider">Feições</div>
              <div className="text-xl font-bold mt-1">{fmt(stats.totalFeatures)}</div>
            </div>
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl p-4 text-white shadow-sm">
              <div className="text-[10px] opacity-80 uppercase tracking-wider">Unidades</div>
              <div className="text-xl font-bold mt-1">{fmt(stats.totalUnits)}</div>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 text-white shadow-sm">
              <div className="text-[10px] opacity-80 uppercase tracking-wider">Área (km²)</div>
              <div className="text-xl font-bold mt-1">{fmt(stats.totalAreaKm2)}</div>
            </div>
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl p-4 text-white shadow-sm">
              <div className="text-[10px] opacity-80 uppercase tracking-wider">Cobertura MZ</div>
              <div className="text-xl font-bold mt-1">{((stats.totalAreaKm2 / MZ_AREA) * 100).toFixed(1)}%</div>
            </div>
          </div>
        )}

        {!province && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-xs text-amber-700">
            <strong>Seleccione uma província</strong> no mapa para ver estatísticas geológicas detalhadas e exportar dados.
          </div>
        )}

        {/* Top lithologies (inline preview) */}
        {stats && stats.lithologies.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Top Litologias — {title}
            </h3>
            <div className="space-y-1.5">
              {stats.lithologies.slice(0, 8).map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded shrink-0" style={{ background: l.color }} />
                  <span className="flex-1 text-slate-700 truncate">{l.name}</span>
                  <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden shrink-0">
                    <div className="h-full rounded-full" style={{ width: `${l.percent}%`, background: l.color }} />
                  </div>
                  <span className="w-10 text-right font-mono text-slate-500">{l.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modules overview */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Módulos de Análise ({countLabel}{indicesLoading ? "" : " índices no total"})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {MODULES.map(m => {
              const cnt = m.id === "geology" ? 0 : getIndexCount(m.id);
              return (
                <div
                  key={m.id}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3 hover:shadow-sm transition-shadow"
                >
                  <div className={`w-9 h-9 rounded-lg ${m.bgColor} flex items-center justify-center shrink-0`}>
                    <span className={m.color}>{m.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{m.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        m.status === "active"
                          ? "bg-sky-100 text-sky-700"
                          : m.status === "requires_gee"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {m.status === "active" ? "Activo" : m.status === "requires_gee" ? "GEE" : "Dados"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{m.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-slate-700">{indicesLoading ? "…" : cnt}</div>
                    <div className="text-[10px] text-slate-400">{cnt === 1 ? "índice" : "índices"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick export actions */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Exportação Rápida
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Relatório JSON */}
            <button
              onClick={handleExportReport}
              disabled={exporting === "report"}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0 group-hover:bg-sky-100 transition-colors">
                  <FileText size={20} className="text-sky-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Relatório JSON</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Relatório completo com dados geológicos, módulos e áreas.
                  </p>
                </div>
                <div className="shrink-0">
                  {exporting === "report" ? (
                    <Loader2 size={16} className="animate-spin text-sky-500" />
                  ) : (
                    <Download size={16} className="text-slate-400 group-hover:text-sky-500 transition-colors" />
                  )}
                </div>
              </div>
            </button>

            {/* Exportar Índices CSV */}
            <button
              onClick={handleExportIndices}
              disabled={exporting === "indices" || !geeStatus?.connected}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                  <BarChart2 size={20} className="text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Índices GEE (CSV)</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Lista completa de todos os {totalIndices} índices disponíveis, com grupo, nome e fórmula.
                  </p>
                </div>
                <div className="shrink-0">
                  {exporting === "indices" ? (
                    <Loader2 size={16} className="animate-spin text-emerald-500" />
                  ) : (
                    <Download size={16} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  )}
                </div>
              </div>
            </button>

            {/* External link to Export Panel */}
            <a
              href="#exportar"
              onClick={(e) => {
                e.preventDefault();
                const exportTab = document.querySelector('[data-tab="Exportar"]') as HTMLButtonElement;
                if (exportTab) exportTab.click();
              }}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all text-left group block"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 group-hover:bg-violet-100 transition-colors">
                  <Layers size={20} className="text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Painel de Exportação</div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    PDF, HTML, CSV, GeoJSON, PNG e Shapefile — formatos completos.
                  </p>
                </div>
                <div className="shrink-0">
                  <ExternalLink size={16} className="text-slate-400 group-hover:text-violet-500 transition-colors" />
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* Module status summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Estado do Sistema
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-slate-800">{MODULES.length}</div>
              <div className="text-[10px] text-slate-400 uppercase mt-0.5">Módulos</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-slate-800">{countLabel}</div>
              <div className="text-[10px] text-slate-400 uppercase mt-0.5">Índices</div>
            </div>
            <div className="bg-sky-50 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-sky-700">
                {geeStatus?.connected ? "Ligado" : "Offline"}
              </div>
              <div className="text-[10px] text-sky-400 uppercase mt-0.5">GEE</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-emerald-700">
                {stats ? ((stats.totalAreaKm2 / MZ_AREA) * 100).toFixed(1) : "0.0"}%
              </div>
              <div className="text-[10px] text-emerald-400 uppercase mt-0.5">Cobertura</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400">
          GeoMoz Explorer v2.1 · {new Date().getFullYear()} · Dados geológicos de Moçambique
        </div>
      </div>
    </div>
  );
}

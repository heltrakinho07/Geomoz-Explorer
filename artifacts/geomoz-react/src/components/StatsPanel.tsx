import {
  Activity, BarChart2, TrendingUp, Hash, Layers, Maximize,
  Box, Download, Loader2, MapPin, ChevronLeft, ChevronRight,
  Sigma, PieChart,
} from "lucide-react";
import { useStats, useGeologyColors } from "@/hooks/useGeoMoz";

interface StatsPanelProps {
  province: string | null;
  district: string | null;
  colorBy: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}
function fmtDec(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(1);
}

const MZ_AREA_KM2 = 801_590;

export default function StatsPanel({ province, district, colorBy, isExpanded, onToggleExpand }: StatsPanelProps) {
  const { data: stats, isLoading } = useStats(province, district);
  const { data: colors } = useGeologyColors(colorBy, province);

  const handleExport = () => {
    if (!stats) return;
    const rows = [
      ["Litologia", "Área km²", "% Área"],
      ...stats.lithologies.map((l) => [l.name, l.areaKm2.toFixed(2), l.percent]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geomoz-${province ?? "mozambique"}-${district ?? "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxRows = isExpanded ? 40 : 6;
  const tableRows = isExpanded ? 30 : 8;
  const coveragePct = stats ? ((stats.totalAreaKm2 / MZ_AREA_KM2) * 100).toFixed(1) : null;
  const avgArea = stats && stats.totalUnits > 0 ? stats.totalAreaKm2 / stats.totalUnits : null;
  const polyPerUnit = stats && stats.totalUnits > 0 ? (stats.totalFeatures / stats.totalUnits).toFixed(1) : null;

  return (
    <aside
      className="bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden shadow-[-2px_0_20px_-12px_rgba(0,0,0,0.15)] transition-all duration-300 ease-in-out"
      style={{ width: isExpanded ? 580 : 300 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 min-w-0">
          <Activity size={14} className="text-sky-500 shrink-0" />
          <span className="truncate">{district ?? province ?? "Moçambique"}</span>
        </div>
        <button
          onClick={onToggleExpand}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors shrink-0 ml-2"
          title={isExpanded ? "Colapsar" : "Expandir análise"}
        >
          {isExpanded ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <div className="overflow-y-auto flex-1 flex flex-col">
        {/* Stat cards */}
        <div className={`p-4 border-b border-slate-100 ${isExpanded ? "shrink-0" : ""}`}>
          {!province && !isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
              <MapPin size={22} className="text-slate-200" />
              <p className="text-xs text-center text-slate-400 leading-relaxed">
                Selecione uma província<br />para ver as métricas de geologia
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-28">
              <Loader2 className="animate-spin w-5 h-5 text-slate-300" />
            </div>
          ) : (
            <>
              <div className={`grid gap-2.5 mb-2.5 ${isExpanded ? "grid-cols-4" : "grid-cols-2"}`}>
                <div className="bg-gradient-to-br from-sky-500 to-blue-600 p-3 rounded-xl text-white shadow-sm shadow-blue-100">
                  <div className="flex items-center gap-1.5 mb-1.5 opacity-75">
                    <Hash size={12} /><span className="text-xs font-medium">Feições</span>
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmt(stats?.totalFeatures ?? 0)}</div>
                </div>
                <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-3 rounded-xl text-white shadow-sm shadow-purple-100">
                  <div className="flex items-center gap-1.5 mb-1.5 opacity-75">
                    <Layers size={12} /><span className="text-xs font-medium">Unidades</span>
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmt(stats?.totalUnits ?? 0)}</div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-3 rounded-xl text-white shadow-sm shadow-orange-100">
                  <div className="flex items-center gap-1.5 mb-1.5 opacity-75">
                    <Maximize size={12} /><span className="text-xs font-medium">Área km²</span>
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmt(stats?.totalAreaKm2 ?? 0)}</div>
                </div>
                <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-3 rounded-xl text-white shadow-sm shadow-teal-100">
                  <div className="flex items-center gap-1.5 mb-1.5 opacity-75">
                    <Box size={12} /><span className="text-xs font-medium">Principal</span>
                  </div>
                  <div className="text-sm font-bold leading-tight line-clamp-2">{stats?.dominant ?? "—"}</div>
                </div>
              </div>

              {/* Extra metrics row */}
              {stats && (
                <div className={`grid gap-2 ${isExpanded ? "grid-cols-3" : "grid-cols-1"}`}>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center gap-2.5">
                    <PieChart size={13} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">Cobertura MZ</div>
                      <div className="text-sm font-semibold text-slate-700">{coveragePct}%</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center gap-2.5">
                    <Sigma size={13} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">Área/unidade</div>
                      <div className="text-sm font-semibold text-slate-700">{avgArea ? fmtDec(avgArea) : "—"} km²</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center gap-2.5">
                    <Hash size={13} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">Polígonos/unidade</div>
                      <div className="text-sm font-semibold text-slate-700">{polyPerUnit ?? "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Lithology bars + legend (side by side when expanded) */}
        <div className={`border-b border-slate-100 ${isExpanded ? "flex divide-x divide-slate-100 shrink-0" : ""}`}>
          <div className={`p-4 ${isExpanded ? "flex-1" : ""}`}>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <BarChart2 size={14} className="text-violet-500" />
              Top Litologias
              {stats && <span className="ml-auto text-xs font-normal text-slate-400">{stats.lithologies.length} total</span>}
            </h3>
            {!province ? (
              <p className="text-xs text-slate-400 text-center py-4">Selecione uma província</p>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-20"><Loader2 className="animate-spin w-5 h-5 text-slate-300" /></div>
            ) : (
              <div className="space-y-3">
                {(stats?.lithologies ?? []).slice(0, maxRows).map((item) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-700 truncate" style={{ maxWidth: isExpanded ? 220 : 168 }} title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-slate-400 ml-2 shrink-0 tabular-nums">{item.percent}%</span>
                    </div>
                    <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                        style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isExpanded && province && colors && colors.items.length > 0 && (
            <div className="p-4 w-56 shrink-0 overflow-y-auto" style={{ maxHeight: 340 }}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Legenda — {colorBy}</h4>
              <div className="space-y-1.5">
                {colors.items.slice(0, 50).map((item) => (
                  <div key={item.value} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shrink-0 shadow-sm border border-white/40" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-slate-600 truncate" title={item.value}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Full analysis table */}
        <div className="p-4 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-500" />
            Análise Detalhada
          </h3>

          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Litologia</th>
                  <th className="py-2.5 px-2 text-right font-semibold">km²</th>
                  <th className="py-2.5 px-3 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {!province ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">Selecione uma província</td></tr>
                ) : isLoading ? (
                  <tr><td colSpan={3} className="py-6 text-center"><Loader2 className="animate-spin w-4 h-4 inline text-slate-300" /></td></tr>
                ) : (stats?.lithologies ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400">Sem dados</td></tr>
                ) : (
                  (stats?.lithologies ?? []).slice(0, tableRows).map((item, i) => {
                    const cols = ["text-sky-600", "text-violet-600", "text-emerald-600", "text-amber-600", "text-rose-600"];
                    return (
                      <tr key={item.name} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/30"}`}>
                        <td className="py-2 px-3 text-slate-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="truncate" style={{ maxWidth: isExpanded ? 230 : 95 }} title={item.name}>{item.name}</span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-500 tabular-nums">{fmt(item.areaKm2)}</td>
                        <td className={`py-2 px-3 text-right font-semibold tabular-nums ${cols[i % cols.length]}`}>{item.percent}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleExport}
            disabled={!province || !stats}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2 px-4 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            Exportar CSV
          </button>
        </div>

        {/* Color legend (collapsed mode) */}
        {!isExpanded && province && colors && colors.items.length > 0 && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4 shrink-0">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Legenda — {colorBy}</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {colors.items.slice(0, 25).map((item) => (
                <div key={item.value} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm shrink-0 shadow-sm border border-white/40" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-600 truncate" title={item.value}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

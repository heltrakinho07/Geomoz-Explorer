import { Activity, BarChart2, TrendingUp, Hash, Layers, Maximize, Box, Download, Loader2, MapPin } from "lucide-react";
import { useStats, useGeologyColors } from "@/hooks/useGeoMoz";

interface StatsPanelProps {
  province: string | null;
  district: string | null;
  colorBy: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

export default function StatsPanel({ province, district, colorBy }: StatsPanelProps) {
  const { data: stats, isLoading } = useStats(province, district);
  const { data: colors } = useGeologyColors(colorBy, province);

  const handleExport = () => {
    if (!stats) return;
    const rows = [
      ["Litologia", "Área km²", "%"],
      ...stats.lithologies.map((l) => [l.name, l.areaKm2, l.percent]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geomoz-${province ?? "mozambique"}-${district ?? "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="w-[300px] bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.1)]">
      {/* Stat cards */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Activity size={16} className="text-sky-500" />
          {district ? district : province ? province : "Moçambique"}
        </h2>

        {!province && !isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
            <MapPin size={24} className="text-slate-300" />
            <p className="text-xs text-center text-slate-400">
              Selecione uma província<br />para ver as métricas de geologia
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Loader2 className="animate-spin w-6 h-6" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-sky-500 to-blue-600 p-3 rounded-xl text-white shadow-sm shadow-blue-200">
              <div className="flex items-center gap-1.5 mb-2 opacity-80">
                <Hash size={14} />
                <span className="text-xs font-medium">Feições</span>
              </div>
              <div className="text-xl font-bold tracking-tight">
                {fmt(stats?.totalFeatures ?? 0)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-3 rounded-xl text-white shadow-sm shadow-purple-200">
              <div className="flex items-center gap-1.5 mb-2 opacity-80">
                <Layers size={14} />
                <span className="text-xs font-medium">Unidades</span>
              </div>
              <div className="text-xl font-bold tracking-tight">
                {fmt(stats?.totalUnits ?? 0)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-3 rounded-xl text-white shadow-sm shadow-orange-200">
              <div className="flex items-center gap-1.5 mb-2 opacity-80">
                <Maximize size={14} />
                <span className="text-xs font-medium">Área (km²)</span>
              </div>
              <div className="text-xl font-bold tracking-tight">
                {fmt(stats?.totalAreaKm2 ?? 0)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-3 rounded-xl text-white shadow-sm shadow-teal-200">
              <div className="flex items-center gap-1.5 mb-2 opacity-80">
                <Box size={14} />
                <span className="text-xs font-medium">Principal</span>
              </div>
              <div className="text-sm font-bold leading-tight line-clamp-2">
                {stats?.dominant ?? "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top lithologies */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <BarChart2 size={16} className="text-violet-500" />
            Top Litologias
          </h3>
        </div>

        {!province ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Selecione uma província para ver as litologias
          </p>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-20 text-slate-400">
            <Loader2 className="animate-spin w-5 h-5" />
          </div>
        ) : (
          <div className="space-y-4">
            {(stats?.lithologies ?? []).slice(0, 6).map((item) => (
              <div key={item.name} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-700 truncate max-w-[180px]" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-slate-500 ml-2 shrink-0">{item.percent}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analysis table */}
      <div className="p-4 flex-1 bg-slate-50/30">
        <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-500" />
          Análise Detalhada
        </h3>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 px-3 font-medium">Litologia</th>
                <th className="py-2.5 px-2 font-medium text-right">km²</th>
                <th className="py-2.5 px-3 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!province ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400 text-xs">
                    Selecione uma província
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">
                    <Loader2 className="animate-spin w-4 h-4 inline" />
                  </td>
                </tr>
              ) : (stats?.lithologies ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400 text-xs">
                    Sem dados
                  </td>
                </tr>
              ) : (
                (stats?.lithologies ?? []).slice(0, 8).map((item, i) => {
                  const colorClass = [
                    "text-sky-600", "text-violet-600", "text-emerald-600",
                    "text-amber-600", "text-rose-600",
                  ];
                  return (
                    <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                      <td
                        className="py-2 px-3 font-medium text-slate-700 truncate max-w-[100px]"
                        title={item.name}
                      >
                        {item.name.length > 14 ? item.name.slice(0, 13) + "…" : item.name}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500">
                        {fmt(item.areaKm2)}
                      </td>
                      <td className={`py-2 px-3 text-right font-medium ${colorClass[i % colorClass.length]}`}>
                        {item.percent}%
                      </td>
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
          className="w-full mt-4 flex items-center justify-center gap-2 py-2 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      {/* Color legend */}
      {province && colors && colors.items.length > 0 && (
        <div className="p-4 border-t border-slate-200">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Legenda — {colorBy}
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {colors.items.slice(0, 20).map((item) => (
              <div key={item.value} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm shrink-0 border border-white/40 shadow-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-slate-600 truncate" title={item.value}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

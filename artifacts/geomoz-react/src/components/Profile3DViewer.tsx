import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Eye,
  Maximize2,
  Mountain,
  Ruler,
  X,
} from "lucide-react";
import type { ProfileStats, ProfilePoint } from "@/lib/dem-terrain";

interface Profile3DViewerProps {
  stats: ProfileStats | null;
  isLoading?: boolean;
  onAlignCamera?: () => void;
  onClose: () => void;
  onHoverPoint?: (point: ProfilePoint | null) => void;
}

export default function Profile3DViewer({
  stats,
  isLoading = false,
  onAlignCamera,
  onClose,
  onHoverPoint,
}: Profile3DViewerProps) {
  if (!stats && !isLoading) return null;

  function exportCSV() {
    if (!stats) return;
    const header = "Ponto,Distancia_km,Elevacao_m,Latitude,Longitude\n";
    const rows = stats.points
      .map(
        (p) =>
          `${p.index},${p.distanceKm},${p.elevationM},${p.lat},${p.lng}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `perfil_topografico_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const relief = stats ? stats.maxElevation - stats.minElevation : 0;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[650] w-[95%] max-w-4xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Perfil Topográfico 3D (Corte A → B)
              <span className="text-[10px] font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                Copernicus GLO-30 / SRTM
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Modelo Digital de Elevação global em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onAlignCamera && (
            <button
              type="button"
              onClick={onAlignCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 rounded-lg transition-colors border border-sky-200/60"
              title="Inclinar câmara para visão em perspectiva do perfil de corte"
            >
              <Eye size={14} />
              <span>Ver em Perspectiva 3D</span>
            </button>
          )}

          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
            title="Exportar dados de elevação em CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-3 text-slate-500 text-sm">
          <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <span>A calcular perfil topográfico no terreno 3D…</span>
        </div>
      ) : stats ? (
        <>
          {/* Key Metrics Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 my-3">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Ruler size={12} className="text-sky-500" />
                <span>Extensão</span>
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {stats.totalDistanceKm} <span className="text-[10px] font-normal text-slate-500">km</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Mountain size={12} className="text-amber-500" />
                <span>Cota Mínima</span>
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {stats.minElevation} <span className="text-[10px] font-normal text-slate-500">m</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Mountain size={12} className="text-rose-500" />
                <span>Cota Máxima</span>
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {stats.maxElevation} <span className="text-[10px] font-normal text-slate-500">m</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Maximize2 size={12} className="text-indigo-500" />
                <span>Desnível Total</span>
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {relief} <span className="text-[10px] font-normal text-slate-500">m</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <ArrowUpRight size={12} className="text-emerald-500" />
                <span>Subida (+)</span>
              </div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{stats.elevationGain} <span className="text-[10px] font-normal text-slate-500">m</span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <ArrowDownRight size={12} className="text-amber-500" />
                <span>Declive Médio</span>
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {stats.avgSlopePercent} <span className="text-[10px] font-normal text-slate-500">%</span>
              </div>
            </div>
          </div>

          {/* Interactive Profile Area Chart */}
          <div className="w-full h-44 sm:h-52 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.points}
                margin={{ top: 8, right: 10, left: -10, bottom: 0 }}
                onMouseMove={(e) => {
                  if (e.activePayload && e.activePayload.length > 0) {
                    onHoverPoint?.(e.activePayload[0].payload as ProfilePoint);
                  }
                }}
                onMouseLeave={() => onHoverPoint?.(null)}
              >
                <defs>
                  <linearGradient id="profileElevationGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.7} />
                    <stop offset="50%" stopColor="#fb923c" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="distanceKm"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(val) => `${val}km`}
                  stroke="#cbd5e1"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(val) => `${val}m`}
                  stroke="#cbd5e1"
                  domain={["dataMin - 20", "dataMax + 20"]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ProfilePoint;
                      return (
                        <div className="bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs shadow-xl border border-slate-700">
                          <p className="font-bold text-rose-300">
                            {data.elevationM} m de altitude
                          </p>
                          <p className="text-[10px] text-slate-300">
                            Distância: {data.distanceKm} km
                          </p>
                          <p className="text-[9px] text-slate-400">
                            Coord: {data.lat.toFixed(4)}°, {data.lng.toFixed(4)}°
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="elevationM"
                  stroke="#e11d48"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#profileElevationGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </div>
  );
}

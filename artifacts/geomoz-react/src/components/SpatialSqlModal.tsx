import React, { useState, useMemo } from "react";
import {
  X, Play, Database, Download, Sparkles, Filter, CheckCircle2,
  AlertCircle, Clock, Table, FileText, Code2, Copy, Layers
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  executeSpatialQuery,
  exportToCsv,
  exportToGeoJson,
  type QueryResult
} from "@/lib/cloud-native-loader";
import { useGeologyGeoJSON, useProvincesGeoJSON } from "@/hooks/useGeoMoz";

interface SpatialSqlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFilterToMap?: (features: GeoJSON.Feature[]) => void;
  aoiPolygon?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

const PRESET_QUERIES = [
  {
    name: "Top Ocorrências por Província",
    sql: "SELECT provincia, count(*), sum(area_km2) FROM deposits GROUP BY provincia ORDER BY count DESC",
    desc: "Agrupa os depósitos e ocorrências minerais por província calculando contagem e área.",
  },
  {
    name: "Filtrar por Ouro & Gemas",
    sql: "SELECT mineral, localidade, provincia, status FROM deposits WHERE mineral = 'Ouro' OR mineral LIKE '%Gemas%'",
    desc: "Filtra apenas ocorrências e alvos de Ouro ou Gemas preciosas.",
  },
  {
    name: "Concessões de Grande Escala (> 50 km²)",
    sql: "SELECT titular, mineral, area_km2, provincia FROM concessions WHERE area_km2 > 50 ORDER BY area_km2 DESC LIMIT 50",
    desc: "Lista as maiores áreas de concessão mineira em ordem decrescente.",
  },
  {
    name: "Intersecção Espacial com AOI",
    sql: "SELECT * FROM features WHERE ST_Intersects(geom, aoi)",
    desc: "Consulta espacial que recorta e retorna apenas feições dentro da área de estudo selecionada.",
  },
];

export default function SpatialSqlModal({
  open,
  onOpenChange,
  onApplyFilterToMap,
  aoiPolygon,
}: SpatialSqlModalProps) {
  const { data: geologyData } = useGeologyGeoJSON();
  const { data: provincesData } = useProvincesGeoJSON();

  const [query, setQuery] = useState(PRESET_QUERIES[0].sql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Combine available GeoJSON features to query
  const sourceFeatures = useMemo(() => {
    const list: GeoJSON.Feature[] = [];
    if (geologyData?.features) list.push(...geologyData.features);
    if (provincesData?.features) list.push(...provincesData.features);
    return list;
  }, [geologyData, provincesData]);

  const handleRunQuery = () => {
    setError(null);
    try {
      const res = executeSpatialQuery(sourceFeatures, query, aoiPolygon);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Erro ao executar consulta SQL.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center shadow-xs">
              <Database size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Console Spatial SQL de Prospecção</span>
                <span className="text-[10px] bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-mono px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                  DuckDB / In-Browser
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Execute consultas espaciais e relacionais diretamente contra as camadas geológicas carregadas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Preset Queries */}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Consultas Rápidas Pré-configuradas:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_QUERIES.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setQuery(p.sql);
                    setError(null);
                  }}
                  className="text-left p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-600 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition-all cursor-pointer"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{p.name}</div>
                  <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* SQL Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Code2 size={12} />
                <span>Editor SQL</span>
              </span>
              <span className="text-[10px] text-slate-400">
                {sourceFeatures.length.toLocaleString()} feições em memória
              </span>
            </div>
            <div className="relative">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-sky-500 border border-slate-700 leading-relaxed resize-none"
                placeholder="SELECT * FROM deposits WHERE mineral = 'Ouro'..."
              />
              <button
                type="button"
                onClick={handleRunQuery}
                className="absolute right-2.5 bottom-3.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <Play size={13} className="fill-white" />
                <span>Executar</span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Results Section */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Table size={14} className="text-sky-500" />
                  <span className="font-semibold">
                    Resultados: <strong className="text-slate-900 dark:text-slate-100">{result.totalCount}</strong> linhas
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({result.executionTimeMs} ms)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {onApplyFilterToMap && result.features && result.features.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onApplyFilterToMap(result.features!)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                    >
                      <Filter size={12} />
                      <span>Filtrar no Mapa</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => exportToCsv(result.rows)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    title="Exportar resultados para CSV"
                  >
                    <Download size={12} />
                    <span>CSV</span>
                  </button>

                  {result.features && result.features.length > 0 && (
                    <button
                      type="button"
                      onClick={() => exportToGeoJson(result.features!)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      title="Exportar feições para GeoJSON"
                    >
                      <Download size={12} />
                      <span>GeoJSON</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Table Render */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {result.columns.map(col => (
                        <th key={col} className="px-3 py-2 font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {result.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        {result.columns.map(col => (
                          <td key={col} className="px-3 py-1.5 text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

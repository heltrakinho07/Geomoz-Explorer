import React, { useMemo, useRef, useState } from "react";
import { Database, Eye, EyeOff, FileUp, Layers, Search, Table2, Trash2 } from "lucide-react";
import { parseWorkspaceFile, workspaceColumns, type WorkspaceLayer } from "@/lib/gis-workspace";

interface Props {
  onLayersChange?: (layers: WorkspaceLayer[]) => void;
}

export default function GISWorkspacePanel({ onLayersChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<WorkspaceLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0] ?? null;
  const columns = useMemo(() => (activeLayer ? workspaceColumns(activeLayer) : []), [activeLayer]);
  const rows = useMemo(() => {
    if (!activeLayer?.geojson) return [];
    const needle = query.trim().toLowerCase();
    return activeLayer.geojson.features.filter((feature) => {
      if (!needle) return true;
      return Object.values(feature.properties ?? {}).some((value) =>
        String(value ?? "").toLowerCase().includes(needle)
      );
    });
  }, [activeLayer, query]);

  const commitLayers = (next: WorkspaceLayer[]) => {
    setLayers(next);
    onLayersChange?.(next);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const parsed = await Promise.all(Array.from(files).map(parseWorkspaceFile));
      const created = parsed.map<WorkspaceLayer>((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        kind: "vector",
        visible: true,
        opacity: 1,
        source: "file",
        format: item.format,
        featureCount: item.geojson.features.length,
        geojson: item.geojson,
        createdAt: new Date().toISOString(),
      }));
      const next = [...created, ...layers];
      commitLayers(next);
      setActiveLayerId(created[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar os dados.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const patchLayer = (id: string, patch: Partial<WorkspaceLayer>) => {
    commitLayers(layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  };

  const removeLayer = (id: string) => {
    const next = layers.filter((layer) => layer.id !== id);
    commitLayers(next);
    if (activeLayerId === id) setActiveLayerId(next[0]?.id ?? null);
  };

  return (
    <div className="flex-1 min-w-0 h-full bg-slate-50 dark:bg-slate-950 p-3 md:p-4 overflow-hidden">
      <div className="h-full grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-3">
        <aside className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Database size={18} className="text-sky-500" />
              <div>
                <h2 className="font-extrabold text-sm">Browser & Dados</h2>
                <p className="text-[11px] text-slate-500">Workspace GIS do projecto</p>
              </div>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold py-2.5"
            >
              <FileUp size={15} /> Adicionar dados
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".geojson,.json,.csv,application/geo+json,application/json,text/csv"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
          </div>

          <div className="p-3 overflow-y-auto flex-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold mb-2">Camadas</div>
            {layers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
                <Layers size={22} className="mx-auto text-slate-400 mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nenhuma camada importada</p>
                <p className="text-[10px] text-slate-400 mt-1">GeoJSON e CSV já funcionam localmente no browser.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${activeLayer?.id === layer.id ? "border-sky-400 bg-sky-50/70 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-800"}`}
                    onClick={() => setActiveLayerId(layer.id)}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        className="mt-0.5 text-slate-500"
                        onClick={(e) => { e.stopPropagation(); patchLayer(layer.id, { visible: !layer.visible }); }}
                        title={layer.visible ? "Ocultar camada" : "Mostrar camada"}
                      >
                        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{layer.name}</div>
                        <div className="text-[10px] text-slate-400">{layer.format} · {layer.featureCount ?? 0} feições</div>
                        <input
                          aria-label={`Opacidade de ${layer.name}`}
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={layer.opacity}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => patchLayer(layer.id, { opacity: Number(e.target.value) })}
                          className="w-full mt-2"
                        />
                      </div>
                      <button
                        className="text-slate-400 hover:text-rose-500"
                        onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                        title="Remover camada"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-w-0">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Table2 size={17} className="text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold truncate">Tabela de Atributos</h3>
                <p className="text-[10px] text-slate-400 truncate">{activeLayer ? activeLayer.name : "Selecione uma camada vetorial"}</p>
              </div>
            </div>
            <label className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar registos…"
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs w-56 max-w-full"
              />
            </label>
          </div>

          <div className="flex-1 overflow-auto">
            {!activeLayer ? (
              <div className="h-full grid place-items-center text-center p-8 text-slate-400">
                <div><Table2 size={34} className="mx-auto mb-3" /><p className="text-sm font-semibold">Adicione uma camada para explorar os atributos.</p></div>
              </div>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-extrabold text-slate-500">#</th>
                    {columns.map((column) => <th key={column} className="px-3 py-2 text-left font-extrabold whitespace-nowrap">{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 1000).map((feature, index) => (
                    <tr key={String(feature.id ?? index)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-sky-50/50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                      {columns.map((column) => <td key={column} className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate">{String(feature.properties?.[column] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {activeLayer && (
            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 flex justify-between">
              <span>{rows.length} / {activeLayer.featureCount ?? 0} registos</span>
              <span>Primeira fase · processamento local</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

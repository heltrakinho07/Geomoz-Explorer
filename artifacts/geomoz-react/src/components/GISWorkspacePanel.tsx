import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Database,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  MapPin,
  Palette,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import {
  DEFAULT_WORKSPACE_STYLE,
  parseWorkspaceFile,
  workspaceColumns,
  workspaceNumericColumns,
  type WorkspaceLayer,
  type WorkspaceSelection,
  type WorkspaceStyleMode,
} from "@/lib/gis-workspace";

interface Props {
  layers: WorkspaceLayer[];
  onLayersChange: (layers: WorkspaceLayer[]) => void;
  selection: WorkspaceSelection | null;
  onSelectionChange: (selection: WorkspaceSelection | null) => void;
  onOpenMap: (layerId: string, featureIndex?: number) => void;
}

export default function GISWorkspacePanel({
  layers,
  onLayersChange,
  selection,
  onSelectionChange,
  onOpenMap,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(selection?.layerId ?? null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selection?.layerId) setActiveLayerId(selection.layerId);
  }, [selection?.layerId]);

  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0] ?? null;
  const columns = useMemo(() => (activeLayer ? workspaceColumns(activeLayer) : []), [activeLayer]);
  const numericColumns = useMemo(
    () => (activeLayer ? workspaceNumericColumns(activeLayer) : []),
    [activeLayer]
  );

  const rows = useMemo(() => {
    if (!activeLayer?.geojson) return [];
    const needle = query.trim().toLowerCase();
    return activeLayer.geojson.features
      .map((feature, featureIndex) => ({ feature, featureIndex }))
      .filter(({ feature }) => {
        if (!needle) return true;
        return Object.values(feature.properties ?? {}).some((value) =>
          String(value ?? "").toLowerCase().includes(needle)
        );
      });
  }, [activeLayer, query]);

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
        style: { ...DEFAULT_WORKSPACE_STYLE },
        createdAt: new Date().toISOString(),
      }));
      onLayersChange([...created, ...layers]);
      setActiveLayerId(created[0]?.id ?? null);
      onSelectionChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar os dados.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const patchLayer = (id: string, patch: Partial<WorkspaceLayer>) => {
    onLayersChange(layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  };

  const patchStyle = (layer: WorkspaceLayer, mode: WorkspaceStyleMode, field?: string) => {
    patchLayer(layer.id, {
      style: {
        ...layer.style,
        mode,
        field,
      },
    });
  };

  const removeLayer = (id: string) => {
    const next = layers.filter((layer) => layer.id !== id);
    onLayersChange(next);
    if (activeLayerId === id) setActiveLayerId(next[0]?.id ?? null);
    if (selection?.layerId === id) onSelectionChange(null);
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
                <p className="text-[11px] text-slate-500">Workspace GIS partilhado com o mapa</p>
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
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold mb-2">
              Camadas
            </div>
            {layers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
                <Layers size={22} className="mx-auto text-slate-400 mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Nenhuma camada importada
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  GeoJSON e CSV podem ser enviados diretamente ao mapa 2D.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${
                      activeLayer?.id === layer.id
                        ? "border-sky-400 bg-sky-50/70 dark:bg-sky-950/20"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                    onClick={() => setActiveLayerId(layer.id)}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        className="mt-0.5 text-slate-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          patchLayer(layer.id, { visible: !layer.visible });
                        }}
                        title={layer.visible ? "Ocultar camada" : "Mostrar camada"}
                      >
                        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{layer.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {layer.format} · {layer.featureCount ?? 0} feições
                        </div>
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
                        className="text-sky-500 hover:text-sky-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMap(layer.id);
                        }}
                        title="Abrir e enquadrar no mapa"
                      >
                        <Crosshair size={14} />
                      </button>
                      <button
                        className="text-slate-400 hover:text-rose-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLayer(layer.id);
                        }}
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
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Table2 size={17} className="text-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold truncate">Tabela de Atributos</h3>
                  <p className="text-[10px] text-slate-400 truncate">
                    {activeLayer ? activeLayer.name : "Selecione uma camada vetorial"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeLayer && (
                  <button
                    onClick={() => onOpenMap(activeLayer.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[11px] font-bold"
                  >
                    <MapPin size={13} /> Ver no mapa
                  </button>
                )}
                <label className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filtrar registos…"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs w-48 max-w-full"
                  />
                </label>
              </div>
            </div>

            {activeLayer && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mr-1">
                  <Palette size={13} className="text-violet-500" /> Estilo
                </div>
                <select
                  value={activeLayer.style.mode}
                  onChange={(e) => {
                    const mode = e.target.value as WorkspaceStyleMode;
                    const fallbackField =
                      mode === "graduated"
                        ? numericColumns[0]
                        : mode === "categorized"
                          ? columns[0]
                          : undefined;
                    patchStyle(activeLayer, mode, fallbackField);
                  }}
                  className="text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
                >
                  <option value="single">Símbolo único</option>
                  <option value="categorized">Categorizado</option>
                  <option value="graduated">Graduado</option>
                </select>

                {activeLayer.style.mode !== "single" && (
                  <select
                    value={activeLayer.style.field ?? ""}
                    onChange={(e) =>
                      patchStyle(activeLayer, activeLayer.style.mode, e.target.value || undefined)
                    }
                    className="text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
                  >
                    {(activeLayer.style.mode === "graduated" ? numericColumns : columns).map(
                      (column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      )
                    )}
                  </select>
                )}

                <span className="text-[10px] text-slate-400">
                  {activeLayer.style.mode === "single"
                    ? "cor uniforme"
                    : activeLayer.style.mode === "categorized"
                      ? "cores automáticas por categoria"
                      : "5 classes graduadas"}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {!activeLayer ? (
              <div className="h-full grid place-items-center text-center p-8 text-slate-400">
                <div>
                  <Table2 size={34} className="mx-auto mb-3" />
                  <p className="text-sm font-semibold">
                    Adicione uma camada para explorar os atributos.
                  </p>
                </div>
              </div>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-extrabold text-slate-500">#</th>
                    {columns.map((column) => (
                      <th
                        key={column}
                        className="px-3 py-2 text-left font-extrabold whitespace-nowrap"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 1000).map(({ feature, featureIndex }, rowIndex) => {
                    const selected =
                      selection?.layerId === activeLayer.id &&
                      selection.featureIndex === featureIndex;
                    return (
                      <tr
                        key={String(feature.id ?? featureIndex)}
                        onClick={() =>
                          onSelectionChange({ layerId: activeLayer.id, featureIndex })
                        }
                        onDoubleClick={() => onOpenMap(activeLayer.id, featureIndex)}
                        className={`border-t border-slate-100 dark:border-slate-800 cursor-pointer ${
                          selected
                            ? "bg-amber-50 dark:bg-amber-950/30 ring-1 ring-inset ring-amber-300 dark:ring-amber-800"
                            : "hover:bg-sky-50/50 dark:hover:bg-slate-800/50"
                        }`}
                        title="Clique para selecionar; duplo clique para focar no mapa"
                      >
                        <td className="px-3 py-2 text-slate-400">{rowIndex + 1}</td>
                        {columns.map((column) => (
                          <td
                            key={column}
                            className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate"
                          >
                            {String(feature.properties?.[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {activeLayer && (
            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 flex justify-between">
              <span>
                {rows.length} / {activeLayer.featureCount ?? 0} registos
              </span>
              <span>{selection?.layerId === activeLayer.id ? "Seleção sincronizada" : "Mapa ↔ tabela"}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { GeoJSON as VectorLayer, MapContainer, ScaleControl, TileLayer, useMap } from "react-leaflet";
import { Database, Eye, EyeOff, FileUp, Layers, Map as MapIcon, Search, Table2, Trash2 } from "lucide-react";
import { parseWorkspaceFile, workspaceColumns, type WorkspaceLayer } from "@/lib/gis-workspace";

function FitSelectedLayer({ layer }: { layer: WorkspaceLayer | null }) {
  const map = useMap();
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    if (!layer || lastId.current === layer.id) return;
    lastId.current = layer.id;
    try {
      const bounds = L.geoJSON(layer.geojson).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
    } catch {
      // Invalid geometries have already been rejected at import time.
    }
  }, [map, layer]);
  return null;
}

export default function GISWorkspacePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<WorkspaceLayer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeLayer = layers.find((layer) => layer.id === activeId) ?? layers[0] ?? null;
  const visibleLayers = layers.filter((layer) => layer.visible);
  const columns = useMemo(() => activeLayer ? workspaceColumns(activeLayer) : [], [activeLayer]);
  const filteredRows = useMemo(() => {
    if (!activeLayer) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return activeLayer.geojson.features;
    return activeLayer.geojson.features.filter((feature) =>
      Object.values(feature.properties ?? {}).some((value) =>
        String(value ?? "").toLowerCase().includes(needle)
      )
    );
  }, [activeLayer, query]);

  const importFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    try {
      const parsed = await Promise.all(Array.from(fileList).map(parseWorkspaceFile));
      const incoming: WorkspaceLayer[] = parsed.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        visible: true,
        opacity: 0.8,
        format: item.format,
        featureCount: item.geojson.features.length,
        geojson: item.geojson,
        createdAt: new Date().toISOString(),
      }));
      setLayers((previous) => [...incoming, ...previous]);
      setActiveId(incoming[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar o ficheiro.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const changeLayer = (id: string, patch: Partial<WorkspaceLayer>) => {
    setLayers((previous) => previous.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  };

  const removeLayer = (id: string) => {
    setLayers((previous) => previous.filter((layer) => layer.id !== id));
    if (activeId === id) setActiveId(layers.find((layer) => layer.id !== id)?.id ?? null);
  };

  return (
    <div className="h-full min-h-0 w-full overflow-auto bg-slate-50 dark:bg-slate-950 p-3 md:p-4">
      <div className="h-full min-h-[600px] grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-3">
        <aside className="min-h-[240px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Database size={18} className="text-sky-500" />
              <div>
                <h2 className="text-sm font-extrabold">GIS Workspace</h2>
                <p className="text-[11px] text-slate-500">Importação e visualização local</p>
              </div>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold py-2.5">
              <FileUp size={15} /> Adicionar dados geoespaciais
            </button>
            <input ref={inputRef} type="file" multiple
              accept=".geojson,.json,.csv,application/geo+json,application/json,text/csv"
              className="hidden" onChange={(e) => void importFiles(e.target.files)} />
            <p className="mt-2 text-[10px] text-slate-500">GeoJSON/CSV · WGS84 · Até 8 MB e 5 000 feições por ficheiro. Dados não são enviados ao servidor.</p>
            {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2 text-[11px] text-rose-700 dark:text-rose-300">{error}</p>}
          </div>
          <div className="p-3 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold">Camadas</span>
              <span className="text-[10px] text-slate-400">{layers.length} importadas</span>
            </div>
            {layers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center">
                <Layers size={24} className="mx-auto text-slate-400 mb-2" />
                <p className="text-xs font-semibold">Nenhuma camada importada</p>
                <p className="text-[11px] text-slate-500 mt-1">Adicione pontos CSV ou geometrias GeoJSON para explorar o mapa e os atributos.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {layers.map((layer) => (
                  <div key={layer.id}
                    className={`rounded-xl border p-2.5 cursor-pointer ${activeLayer?.id === layer.id ? "border-sky-400 bg-sky-50 dark:bg-sky-950/30" : "border-slate-200 dark:border-slate-800"}`}
                    onClick={() => { setActiveId(layer.id); setQuery(""); }}>
                    <div className="flex items-start gap-2">
                      <button type="button" aria-label={layer.visible ? "Ocultar camada" : "Mostrar camada"}
                        onClick={(e) => { e.stopPropagation(); changeLayer(layer.id, { visible: !layer.visible }); }}
                        className="mt-0.5 text-slate-500">{layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate">{layer.name}</p>
                        <p className="text-[10px] text-slate-500">{layer.format} · {layer.featureCount} feições</p>
                        <input aria-label={`Opacidade: ${layer.name}`} type="range" min={0.1} max={1} step={0.05}
                          value={layer.opacity} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => changeLayer(layer.id, { opacity: Number(e.target.value) })}
                          className="mt-2 w-full" />
                      </div>
                      <button type="button" aria-label={`Remover ${layer.name}`}
                        onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                        className="text-slate-400 hover:text-rose-500"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="min-h-[550px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
            <span className="flex items-center gap-1.5 text-xs font-bold"><MapIcon size={15} className="text-sky-500" /> Mapa GIS</span>
            <span className="text-[10px] text-slate-500">{visibleLayers.length} visíveis · EPSG:4326</span>
          </div>
          <div className="h-[290px] md:h-[44%] min-h-[260px] relative">
            <MapContainer center={[-18.6, 35.5]} zoom={5} scrollWheelZoom zoomControl
              className="h-full w-full z-0" style={{ height: "100%", width: "100%" }}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {visibleLayers.map((layer) => (
                <VectorLayer key={`${layer.id}-${layer.opacity}`} data={layer.geojson}
                  style={{ color: "#0284c7", opacity: layer.opacity, fillOpacity: layer.opacity * 0.27, weight: 2 }}
                  pointToLayer={(_, latlng) => L.circleMarker(latlng, {
                    radius: 5, color: "#0369a1", weight: 1.5,
                    fillColor: "#0ea5e9", fillOpacity: layer.opacity,
                  })} />
              ))}
              <FitSelectedLayer layer={activeLayer} />
              <ScaleControl position="bottomleft" />
            </MapContainer>
          </div>
          <div className="flex flex-1 min-h-[220px] flex-col border-t border-slate-200 dark:border-slate-800">
            <div className="p-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-extrabold"><Table2 size={15} className="text-sky-500" /> Tabela de atributos</h3>
                <p className="text-[11px] text-slate-500 truncate">{activeLayer?.name ?? "Seleccione uma camada"}</p>
              </div>
              <label className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar atributos…"
                  className="pl-7 pr-2 py-1.5 rounded-lg text-xs w-52 max-w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
              </label>
            </div>
            <div className="flex-1 overflow-auto">
              {!activeLayer ? (
                <div className="grid place-items-center p-8 text-xs text-slate-500">Importe uma camada para consultar os seus atributos.</div>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      {columns.map((column) => <th key={column} className="px-3 py-2 text-left whitespace-nowrap">{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 300).map((feature, i) => (
                      <tr key={String(feature.id ?? i)} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                        {columns.map((column) => <td key={column} className="px-3 py-2 whitespace-nowrap max-w-[280px] truncate">{String(feature.properties?.[column] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {activeLayer && (
              <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex justify-between text-[10px] text-slate-500">
                <span>{filteredRows.length} / {activeLayer.featureCount} registos</span>
                <span>Mostrando até 300 linhas · Local no navegador</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

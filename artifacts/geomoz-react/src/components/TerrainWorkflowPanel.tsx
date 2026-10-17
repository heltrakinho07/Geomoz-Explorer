import { useEffect, useRef, useState } from "react";
import { Mountain, Play, Square, Download, MapPin, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { aoiToAPI, computeGeoJSONBounds, type AreaOfInterest } from "@/lib/aoi";
import { resolveGISRasterRemoteUrl, type GISWorkspaceRasterLayer } from "@/lib/gis-raster";
import { DEFAULT_TERRAIN_OPTIONS, MAX_DEM_BYTES, validateTerrainOptions, type Bounds, type TerrainOptions, type TerrainProgress, type TerrainResult } from "@/lib/terrain-workflow";
import { readBoundedDem, runTerrainWorkflow } from "@/lib/terrain-workflow-client";
import { downloadTerrainBlob, exportTerrainPdf, exportTerrainPng } from "@/lib/terrain-report";

interface Props {
  aoi: AreaOfInterest;
  rasters: GISWorkspaceRasterLayer[];
  onComplete: (result: TerrainResult) => void;
  onShowProduct: (id: string) => void;
  onDraw: () => void;
}
const field = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const button = "rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700";

export default function TerrainWorkflowPanel({ aoi, rasters, onComplete, onShowProduct, onDraw }: Props) {
  const [source, setSource] = useState<"file" | "layer" | "gee">("file");
  const [file, setFile] = useState<File | null>(null);
  const [layerId, setLayerId] = useState("");
  const [options, setOptions] = useState<TerrainOptions>({ ...DEFAULT_TERRAIN_OPTIONS });
  const [clip, setClip] = useState(false);
  const [acquisitionNote, setAcquisitionNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<TerrainProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TerrainResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const selected = rasters.find(r => r.id === layerId) ?? rasters[0];
  const aoiBounds = aoi.bounds ?? (aoi.geometry ? computeGeoJSONBounds(aoi.geometry) : null);
  const bbox: Bounds | undefined = aoiBounds ? [aoiBounds[0][1], aoiBounds[0][0], aoiBounds[1][1], aoiBounds[1][0]] : undefined;
  const patch = (key: keyof TerrainOptions, value: number | boolean | string) => setOptions(prev => ({ ...prev, [key]: value }));

  async function start() {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(null); setAcquisitionNote(null);
    setProgress({ completed: 0, total: options.hydrology ? 10 : 5, label: "A obter o DEM…" });
    try {
      const params = { ...options, elevationUnit: source === "gee" ? "metres" as const : options.elevationUnit, bbox: clip ? bbox : undefined };
      validateTerrainOptions(params);
      let bytes: Uint8Array;
      let name: string;
      if (source === "gee") {
        if (aoi.source === "global" || (aoi.source === "mozambique" && !aoi.province))
          throw new Error("Seleccione um distrito/província ou desenhe uma área antes de obter o DEM.");
        const response = await apiFetch("/geomoz-api/gee/download-url", {
          method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: "elevation", ...aoiToAPI(aoi), scale: options.resolution }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(typeof body.detail === "string" ? body.detail : "Não foi possível obter o DEM. Verifique a ligação ao Earth Engine e reduza a área.");
        }
        const data = await response.json();
        if (typeof data.downloadUrl !== "string" || !data.downloadUrl.startsWith("https://")) throw new Error("O Earth Engine não devolveu um URL de download válido.");
        if (Number.isFinite(data.scale) && data.scale >= 1) {
          if (data.scale > 1000) throw new Error("A área seleccionada é demasiado extensa. Desenhe uma área menor para o DEM.");
          params.resolution = data.scale;
          if (data.resolutionAdjusted) setAcquisitionNote(`DEM obtido a ${data.scale} m em vez de ${options.resolution} m para respeitar o limite de download. Use uma área menor para mais detalhe.`);
        }
        bytes = await readBoundedDem(await fetch(data.downloadUrl, { signal: abort.signal }), abort.signal);
        name = `Copernicus GLO-30 via GeoMoz/GEE (focal mean 3 m) — ${aoi.label}`;
      } else {
        const input = source === "file" ? file : selected?.file;
        name = source === "file" ? file?.name ?? "" : selected?.name ?? "";
        if (input) {
          if (input.size > MAX_DEM_BYTES) throw new Error("Use um DEM até 64 MiB.");
          bytes = new Uint8Array(await input.arrayBuffer());
        } else if (source === "layer" && selected) {
          const url = await resolveGISRasterRemoteUrl(selected);
          if (!url) throw new Error("A camada não tem um ficheiro acessível.");
          bytes = await readBoundedDem(await fetch(url, { signal: abort.signal }), abort.signal);
        } else throw new Error("Seleccione um GeoTIFF ou HGT de elevação.");
      }
      abort.signal.throwIfAborted();
      const output = await runTerrainWorkflow(bytes, name, params, abort.signal, setProgress);
      abort.signal.throwIfAborted();
      if (!mounted.current) return;
      onComplete(output); setResult(output);
      if (output.report.grid.resolution !== options.resolution) setAcquisitionNote(`Análise concluída com grelha de ${output.report.grid.resolution} m. Consulte os parâmetros e a proveniência para a resolução efectiva.`);
    } catch (cause) {
      if (mounted.current) setError(abort.signal.aborted ? "Análise cancelada. Os resultados anteriores continuam disponíveis." : cause instanceof Error ? cause.message : String(cause));
    } finally {
      controller.current = null;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  }
  async function exportFile(action: () => Promise<void>) {
    setExporting(true); setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setExporting(false); }
  }

  return <section className="space-y-4 p-3 text-sm" aria-label="Análise de terreno e hidrologia">
    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900 dark:bg-teal-950/40">
      <h3 className="flex items-center gap-2 font-bold"><Mountain size={18} /> Terreno e Hidrologia</h3>
      <p className="mt-1 text-xs leading-relaxed">Transforme um DEM em mapas de relevo, drenagem potencial e bacias. Os resultados ficam nas camadas do projecto.</p>
    </div>
    <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
      <legend className="mb-2 font-semibold">1. Escolher o DEM</legend>
      <label className="block">Fonte
        <select className={field} value={source} onChange={e => setSource(e.target.value as typeof source)}>
          <option value="file">GeoTIFF ou SRTM HGT do computador</option><option value="layer">Camada raster do projecto</option><option value="gee">Copernicus DEM · Earth Engine</option>
        </select>
      </label>
      {source === "file" && <label className="block text-xs">GeoTIFF de elevação, uma banda, até 64 MiB; ou SRTM HGT (.hgt)
        <input className={field + " mt-1"} type="file" accept=".tif,.tiff,.hgt,image/tiff" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </label>}
      {source === "layer" && <label className="block">Camada de elevação
        <select className={field} value={selected?.id ?? ""} onChange={e => setLayerId(e.target.value)}>
          {!rasters.length && <option value="">Carregue primeiro um raster no projecto</option>}
          {rasters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>}
      <div className="rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">
        <strong>Área seleccionada:</strong> {aoi.label}
        {bbox && <p className="mt-1 font-mono">{bbox.map(v => v.toFixed(4)).join(", ")} (W, S, E, N)</p>}
        <button type="button" className={button + " mt-2 block"} onClick={() => { setClip(true); setError(null); onDraw(); }}><MapPin size={12} className="mr-1 inline" /> Desenhar área no mapa</button>
      </div>
      {source === "gee" ? <p className="text-xs text-slate-500">Requer ligação ao Earth Engine nas definições. Áreas grandes podem exceder o limite de download; use um recorte menor ou uma resolução maior.</p> : <label className="flex gap-2 text-xs">
        <input type="checkbox" checked={clip && !!bbox} disabled={!bbox} onChange={e => setClip(e.target.checked)} /> Recortar pela extensão rectangular desenhada
      </label>}
      <label className="block">Unidade das elevações
        <select className={field} disabled={source === "gee"} value={source === "gee" ? "metres" : options.elevationUnit} onChange={e => patch("elevationUnit", e.target.value)}>
          <option value="metres">Metros</option><option value="feet">Pés (converter para metros)</option>
        </select>
      </label>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
      <legend className="mb-2 font-semibold">2. Configurar a análise</legend>
      <label className="block">Resolução da grelha (m)
        <input className={field} type="number" min="1" max="1000" value={options.resolution} onChange={e => patch("resolution", Number(e.target.value))} />
      </label>
      <p className="text-xs text-slate-500">Grelha UTM automática, até 1 milhão de células. A resolução pode ser ajustada em áreas grandes. Uma célula menor não aumenta o detalhe da fonte.</p>
      <div className="grid grid-cols-2 gap-2">
        <label>Azimute solar (°)<input className={field} type="number" min="0" max="360" value={options.azimuth} onChange={e => patch("azimuth", Number(e.target.value))} /></label>
        <label>Altura solar (°)<input className={field} type="number" min="1" max="90" value={options.altitude} onChange={e => patch("altitude", Number(e.target.value))} /></label>
      </div>
      <label className="flex gap-2"><input type="checkbox" checked={options.hydrology} onChange={e => patch("hydrology", e.target.checked)} /> Incluir drenagem e bacias</label>
      {options.hydrology && <>
        <label className="block">Área contribuinte mínima dos canais (km²)
          <input className={field} type="number" min="0.000001" step="0.1" value={options.streamAreaKm2} onChange={e => patch("streamAreaKm2", Number(e.target.value))} />
        </label>
        <p className="text-xs text-slate-500">Bacias calculadas até às bordas do DEM. Use uma área com margem a montante; canais potenciais não representam uma previsão de inundação.</p>
      </>}
    </fieldset>
    <div className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => void start()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-3 font-semibold text-white disabled:opacity-50"><Play size={15} /> {busy ? "A analisar…" : "Executar análise completa"}</button>
      {busy && <button type="button" onClick={() => controller.current?.abort()} className={button}><Square size={14} className="mr-1 inline" /> Cancelar</button>}
    </div>
    {progress && <div role="status" aria-live="polite" className="space-y-1 text-xs">
      <span>{progress.label}</span><progress className="w-full accent-teal-600" value={progress.completed} max={progress.total} />
    </div>}
    {acquisitionNote && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{acquisitionNote}</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
    {result && <div className="space-y-2">
      <h4 className="font-semibold">3. Resultados ({result.products.length})</h4>
      <p className="text-xs">EPSG:{result.report.grid.epsg} · {result.report.grid.resolution} m · {(result.report.durationMs / 1000).toFixed(1)} s</p>
      {result.products.map(product => <article key={product.id} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
        <strong className="text-xs">{product.name}</strong>
        <p className="text-xs text-slate-500">{product.validCells ? `${product.min?.toFixed(2)} – ${product.max?.toFixed(2)} ${product.unit}` : "Nenhuma célula atingiu o limiar escolhido"}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <button className={button} onClick={() => onShowProduct(product.id)}>Ver no mapa</button>
          <button className={button} onClick={() => downloadTerrainBlob(new Blob([new Uint8Array(product.bytes).buffer], { type: "image/tiff" }), product.fileName)}><Download size={12} className="mr-1 inline" /> GeoTIFF</button>
          <button className={button} disabled={exporting} onClick={() => void exportFile(() => exportTerrainPng(product, result.report))}>PNG</button>
        </div>
      </article>)}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={exporting} onClick={() => void exportFile(() => exportTerrainPdf(result.products, result.report))}><FileText size={12} className="mr-1 inline" /> Relatório PDF</button>
        <button className={button} onClick={() => downloadTerrainBlob(new Blob([JSON.stringify(result.report, null, 2)], { type: "application/json" }), "GeoMoz_Analise_Terreno.json")}>Parâmetros e proveniência</button>
      </div>
      <p className="text-xs text-slate-500">Os GeoTIFFs são guardados no projecto. Descarregue o relatório e os parâmetros para conservar o registo desta execução.</p>
    </div>}
  </section>;
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, ImageOverlay, MapContainer, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Crosshair, Download, FileImage, MapPin, Play, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  fitGcps, georeferenceImage, lonLatToTarget, targetToLonLat, MIN_GCPS,
  type Gcp, type GeoreferenceOutput, type Resampling, type TargetCrs, type TransformMethod,
} from "@/lib/georeferencing";

type GeoreferencingResult = GeoreferenceOutput & { name: string };
const action = "rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed";
const input = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2 text-xs";
const crsOptions: Array<{ value: TargetCrs; label: string }> = [
  { value: 4326, label: "EPSG:4326 · WGS 84 (lon/lat)" },
  { value: 3857, label: "EPSG:3857 · Web Mercator" },
  { value: 32735, label: "EPSG:32735 · WGS 84 / UTM 35S" },
  { value: 32736, label: "EPSG:32736 · WGS 84 / UTM 36S" },
  { value: 32737, label: "EPSG:32737 · WGS 84 / UTM 37S" },
];

function ReferenceInteractions({
  picking, onPick, resultBounds,
}: {
  picking: boolean; onPick: (lon: number, lat: number) => void;
  resultBounds: L.LatLngBoundsExpression | null;
}) {
  const map = useMapEvents({ click(event) { if (picking) onPick(event.latlng.lng, event.latlng.lat); } });
  const fittedOnce = useRef<string>("");
  useEffect(() => {
    // Leaflet precisa recalcular o tamanho quando o utilizador abre esta aba.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    if (map.getContainer().parentElement) observer.observe(map.getContainer().parentElement!);
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (!resultBounds) { fittedOnce.current = ""; return; }
    const key = JSON.stringify(resultBounds);
    if (fittedOnce.current !== key) {
      fittedOnce.current = key;
      map.fitBounds(resultBounds, { padding: [24, 24], maxZoom: 16 });
    }
  }, [map, resultBounds]);
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function GeoReferencer() {
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [gcps, setGcps] = useState<Gcp[]>([]);
  const [pending, setPending] = useState<{ px: number; py: number } | null>(null);
  const [manualX, setManualX] = useState("");
  const [manualY, setManualY] = useState("");
  const [picking, setPicking] = useState(false);
  const [crs, setCrs] = useState<TargetCrs>(4326);
  const [method, setMethod] = useState<TransformMethod>("affine");
  const [resampling, setResampling] = useState<Resampling>("nearest");
  const [result, setResult] = useState<GeoreferencingResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [opacity, setOpacity] = useState(0.75);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setFileUrl(""); return; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!result) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(result.preview);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);
  useEffect(() => {
    const image = imageRef.current;
    if (!image || typeof ResizeObserver === "undefined") return;
    const measure = () => setDisplaySize({ width: image.clientWidth, height: image.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(image); measure();
    return () => observer.disconnect();
  }, [fileUrl]);
  const calculated = useMemo(() => {
    if (!imageSize.width || gcps.length < MIN_GCPS[method]) return null;
    try { return { transform: fitGcps(gcps, imageSize.width, imageSize.height, method), error: "" }; }
    catch (cause) { return { transform: null, error: cause instanceof Error ? cause.message : "Transformação inválida." }; }
  }, [gcps, imageSize, method]);
  const residualById = useMemo(() => new Map(calculated?.transform?.residuals.map(item => [item.id, item.pixelError]) ?? []), [calculated]);

  const bounds = useMemo((): L.LatLngBoundsExpression | null => {
    if (!result) return null;
    const nw = targetToLonLat(result.extent.minX, result.extent.maxY, crs);
    const se = targetToLonLat(result.extent.maxX, result.extent.minY, crs);
    if (![nw.lon, nw.lat, se.lon, se.lat].every(Number.isFinite)) return null;
    return [[Math.max(-85, Math.min(85, se.lat)), nw.lon], [Math.max(-85, Math.min(85, nw.lat)), se.lon]];
  }, [result, crs]);

  const chooseImage = (next: File | null) => {
    if (!next) return;
    setError("");
    if (!/\.(png|jpe?g|webp|bmp)$/i.test(next.name) || (next.type && !next.type.startsWith("image/"))) {
      setError("Escolha PNG, JPG, WEBP ou BMP. Para PDF, exporte primeiro a página como PNG/JPG.");
      return;
    }
    if (next.size > 55 * 1024 * 1024) {
      setError("Ficheiro acima do limite de 55 MB.");
      return;
    }
    setFile(next); setImageSize({ width: 0, height: 0 }); setGcps([]);
    setPending(null); setPicking(false); setResult(null); setManualX(""); setManualY("");
  };
  const selectPixel = (event: React.MouseEvent<HTMLImageElement>) => {
    const image = imageRef.current;
    if (!image) return;
    const r = image.getBoundingClientRect();
    const px = (event.clientX - r.left) / r.width * image.naturalWidth;
    const py = (event.clientY - r.top) / r.height * image.naturalHeight;
    setPending({ px, py }); setPicking(false); setError(""); setResult(null);
  };
  const insertGcp = (pixel: { px: number; py: number }, x: number, y: number) => {
    if (![x, y].every(Number.isFinite)) { setError("Indique coordenadas X/Y numéricas."); return; }
    try {
      const geographic = targetToLonLat(x, y, crs);
      if (![geographic.lon, geographic.lat].every(Number.isFinite) || Math.abs(geographic.lat) > 90
        || Math.abs(geographic.lon) > 180) throw new Error("Coordenadas fora da cobertura terrestre.");
      setGcps(existing => [...existing, { id: crypto.randomUUID(), ...pixel, x, y }]);
      setPending(null); setPicking(false); setManualX(""); setManualY(""); setResult(null); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "SRC ou coordenadas inválidos."); }
  };
  const pickFromMap = (lon: number, lat: number) => {
    if (!pending) return;
    try {
      const coords = lonLatToTarget(lon, lat, crs);
      insertGcp(pending, coords.x, coords.y);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível obter coordenadas do mapa."); }
  };
  const changeCrs = (next: TargetCrs) => {
    if (next === crs) return;
    // Reprojecta os GCPs já definidos, em vez de reinterpretar as coordenadas X/Y.
    try {
      const converted = gcps.map(point => {
        const lonlat = targetToLonLat(point.x, point.y, crs);
        const target = lonLatToTarget(lonlat.lon, lonlat.lat, next);
        return { ...point, x: target.x, y: target.y };
      });
      setGcps(converted); setCrs(next); setResult(null); setError("");
    } catch (cause) { setError("Não foi possível converter os GCPs para o SRC escolhido."); }
  };
  const updateGcp = (id: string, axis: "x" | "y", value: string) => {
    setGcps(existing => existing.map(point => point.id === id
      ? { ...point, [axis]: value.trim() === "" ? NaN : Number(value) } : point));
    setResult(null);
  };
  const execute = async () => {
    if (!file || running || !calculated?.transform) return;
    setRunning(true); setError(""); setResult(null);
    try {
      // Dá oportunidade ao navegador de renderizar o estado de processamento.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const generated = await georeferenceImage(file, gcps, method, crs, resampling);
      setResult({ ...generated, name: file.name.replace(/\.[^.]+$/, "") });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A georreferenciação falhou.");
    } finally { setRunning(false); }
  };
  const exportGcps = () => {
    const project = { application: "GeoMoz GIS Workspace", version: 1, image: file?.name,
      imageWidth: imageSize.width, imageHeight: imageSize.height, epsg: crs, method, resampling,
      rmsPixels: calculated?.transform?.rmsPixels ?? null, gcps };
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
      (file?.name.replace(/\.[^.]+$/, "") ?? "projeto") + "_gcps.geomoz.json");
  };
  const importGcps = async (source: File | null) => {
    if (!source || !file) return;
    try {
      const project = JSON.parse(await source.text());
      if (!Array.isArray(project.gcps) || project.imageWidth !== imageSize.width || project.imageHeight !== imageSize.height) {
        throw new Error("Os GCPs importados não correspondem às dimensões desta imagem.");
      }
      if (!crsOptions.some(option => option.value === project.epsg)
        || !["linear", "helmert", "affine", "polynomial2"].includes(project.method)) {
        throw new Error("SRC ou algoritmo do projecto inválido.");
      }
      const imported: Gcp[] = project.gcps.map((item: Gcp) => ({
        id: crypto.randomUUID(), px: Number(item.px), py: Number(item.py), x: Number(item.x), y: Number(item.y),
      }));
      if (imported.length > 500 || imported.some(g => ![g.px, g.py, g.x, g.y].every(Number.isFinite)
        || g.px < 0 || g.py < 0 || g.px > imageSize.width || g.py > imageSize.height)) {
        throw new Error("Os GCPs contêm coordenadas inválidas.");
      }
      setGcps(imported); setCrs(project.epsg as TargetCrs); setMethod(project.method as TransformMethod);
      setResampling(project.resampling === "bilinear" ? "bilinear" : "nearest");
      setResult(null); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Projecto de GCPs inválido."); }
  };

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4 bg-slate-50 dark:bg-slate-950 h-full min-h-0 overflow-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex gap-2 items-center font-extrabold text-base"><Crosshair size={20} className="text-sky-600" /> Georreferenciador GeoMoz</h2>
          <p className="text-xs text-slate-500">GCPs · Ajuste geométrico · Raster GeoTIFF · Processamento local</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,image/png,image/jpeg,image/webp,image/bmp"
            className="hidden" onChange={event => { chooseImage(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <button type="button" className={action} onClick={() => fileInput.current?.click()}><Upload size={14} className="inline mr-1" /> Abrir imagem</button>
          <input ref={importInput} type="file" className="hidden" accept=".json"
            onChange={event => { void importGcps(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          <button type="button" disabled={!file || !imageSize.width} onClick={() => importInput.current?.click()}
            className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Importar GCPs</button>
          <button type="button" disabled={!gcps.length} onClick={exportGcps}
            className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">Guardar GCPs</button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        <label className="text-xs font-semibold space-y-1">SRC de saída
          <select className={input} value={crs} onChange={event => changeCrs(Number(event.target.value) as TargetCrs)}>
            {crsOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">Transformação
          <select className={input} value={method} onChange={event => { setMethod(event.target.value as TransformMethod); setResult(null); }}>
            <option value="linear">Linear · posição e escala (mín. 2)</option>
            <option value="helmert">Helmert (mín. 2 GCPs)</option>
            <option value="affine">Polinomial 1 · Afim (mín. 3)</option>
            <option value="polynomial2">Polinomial 2 (mín. 6)</option>
          </select>
        </label>
        <label className="text-xs font-semibold space-y-1">Reamostragem
          <select className={input} value={resampling} onChange={event => { setResampling(event.target.value as Resampling); setResult(null); }}>
            <option value="nearest">Vizinho mais próximo</option>
            <option value="bilinear">Bilinear · imagens contínuas</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-1">
          <button type="button" disabled={!calculated?.transform || !file || running} onClick={() => void execute()} className={action}>
            <Play size={14} className="inline mr-1" /> {running ? "A processar raster…" : "Iniciar georreferenciação"}
          </button>
          <p className="text-[10px] text-slate-500 text-center">
            {gcps.length}/{MIN_GCPS[method]} pontos mínimos · RMS: {calculated?.transform
              ? calculated.transform.rmsPixels.toFixed(2) + " px" : "—"}
          </p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs p-3">{error}</p>}
      {calculated?.error && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs p-3">{calculated.error}</p>}
      {calculated?.transform && calculated.transform.rmsPixels > 3 && <p className="text-xs text-amber-700 dark:text-amber-300">
        RMS superior a 3 píxeis. Revise os pontos com maior residual e a sua distribuição antes de exportar.
      </p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-[340px]">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col min-h-[340px]">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between gap-2">
            <div className="flex gap-2 items-center min-w-0"><FileImage size={16} className="text-sky-600 shrink-0" />
              <strong className="text-xs truncate">{file?.name ?? "Imagem de origem"}</strong>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">{imageSize.width ? imageSize.width + " × " + imageSize.height + " px" : "Sem imagem"}</span>
          </div>
          <div className="overflow-auto p-3 bg-slate-100 dark:bg-slate-950 min-h-[300px] flex items-center justify-center">
            {!fileUrl ? <div className="max-w-sm text-center text-slate-500 text-xs space-y-2">
              <FileImage size={34} className="mx-auto opacity-50" />
              <p>Abra uma planta ou mapa digitalizado PNG/JPEG para escolher pontos de controlo.</p>
              <p>Não são enviados ficheiros para o servidor.</p>
            </div> : <div className="relative inline-block max-w-full">
              <img src={fileUrl} ref={imageRef} alt="Raster original para seleccionar GCPs"
                className="block max-w-full max-h-[530px] h-auto object-contain cursor-crosshair select-none"
                draggable={false} onClick={selectPixel}
                onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => setError("O navegador não conseguiu descodificar esta imagem.")} />
              {imageSize.width > 0 && gcps.map((point, index) => (
                <span key={point.id} title={"GCP " + (index + 1)} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-rose-600 ring-2 ring-white text-[10px] text-white font-bold flex items-center justify-center"
                  style={{ left: (point.px / imageSize.width * displaySize.width) + "px", top: (point.py / imageSize.height * displaySize.height) + "px" }}>{index + 1}</span>
              ))}
              {pending && imageSize.width > 0 && <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-3xl leading-none text-emerald-500 drop-shadow" style={{
                left: (pending.px / imageSize.width * displaySize.width) + "px", top: (pending.py / imageSize.height * displaySize.height) + "px",
              }}>+</span>}
            </div>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col min-h-[340px]">
          <div className="flex gap-2 items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
            <strong className="text-xs flex items-center gap-1"><MapPin size={16} className="text-sky-600" /> Mapa de referência</strong>
            {picking && <span className="text-[11px] text-emerald-600 font-bold">Clique na posição correspondente no mapa</span>}
          </div>
          <div className={picking ? "h-full min-h-[320px] cursor-crosshair" : "h-full min-h-[320px]"}>
            <MapContainer center={[-18.5, 35]} zoom={5} scrollWheelZoom className="h-full w-full" style={{ height: "100%", minHeight: 320 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
              {bounds && previewUrl && <ImageOverlay url={previewUrl} bounds={bounds} opacity={opacity} />}
              {gcps.map((point, index) => {
                const ll = targetToLonLat(point.x, point.y, crs);
                if (!Number.isFinite(ll.lon) || !Number.isFinite(ll.lat) || Math.abs(ll.lat) > 90) return null;
                return <CircleMarker key={point.id} center={[ll.lat, ll.lon]} radius={7}
                  pathOptions={{ color: "#ffffff", fillColor: "#e11d48", fillOpacity: 1, weight: 2 }}>
                  <Tooltip>GCP {index + 1}</Tooltip>
                </CircleMarker>;
              })}
              <ReferenceInteractions picking={picking} onPick={pickFromMap} resultBounds={bounds} />
              <ScaleControl position="bottomleft" />
            </MapContainer>
          </div>
          {result && <label className="flex items-center gap-2 px-3 py-2 text-xs border-t border-slate-200 dark:border-slate-800">
            Opacidade da imagem georreferenciada
            <input className="flex-1" type="range" min="0" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} />
            {Math.round(opacity * 100)}%
          </label>}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-extrabold text-sm">Pontos de controlo (GCPs)</h3>
          <button type="button" disabled={!gcps.length} onClick={() => { setGcps([]); setResult(null); setPending(null); }}
            className="flex items-center gap-1 text-xs text-rose-600 disabled:opacity-40"><RotateCcw size={13}/> Limpar pontos</button>
        </div>
        <p className="text-xs text-slate-500">
          1. Clique num ponto reconhecível na imagem. 2. Introduza as coordenadas no SRC seleccionado ou seleccione o mesmo local no mapa. 3. Distribua os GCPs por toda a imagem.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="text-xs flex-1 min-w-[160px]">
            <p className="font-semibold mb-1">Píxel seleccionado</p>
            <p className="rounded-lg border dark:border-slate-700 p-2 text-slate-500">{pending
              ? "X " + pending.px.toFixed(1) + " / Y " + pending.py.toFixed(1) : "Clique na imagem à esquerda"}</p>
          </div>
          <label className="text-xs min-w-[110px] flex-1">X · Este / Longitude
            <input className={input} inputMode="decimal" type="number" step="any" value={manualX} onChange={event => setManualX(event.target.value)} />
          </label>
          <label className="text-xs min-w-[110px] flex-1">Y · Norte / Latitude
            <input className={input} inputMode="decimal" type="number" step="any" value={manualY} onChange={event => setManualY(event.target.value)} />
          </label>
          <button type="button" disabled={!pending || !manualX.trim() || !manualY.trim()} className={action}
            onClick={() => pending && insertGcp(pending, Number(manualX), Number(manualY))}>Adicionar GCP</button>
          <button type="button" disabled={!pending} className={picking ? action : "rounded-xl border border-sky-500 text-sky-600 px-3 py-2 text-xs font-bold disabled:opacity-40"}
            onClick={() => setPicking(value => !value)}><MapPin size={14} className="inline mr-1" /> {picking ? "Cancelar selecção" : "A partir do mapa"}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Píxel X</th><th className="p-2 text-left">Píxel Y</th>
                <th className="p-2 text-left">Coordenada X</th><th className="p-2 text-left">Coordenada Y</th>
                <th className="p-2 text-left">Erro (px)</th><th className="p-2">Remover</th></tr>
            </thead>
            <tbody>
              {gcps.map((point, index) => <tr className="border-b dark:border-slate-800" key={point.id}>
                <td className="p-2">{index + 1}</td><td className="p-2 tabular-nums">{point.px.toFixed(1)}</td>
                <td className="p-2 tabular-nums">{point.py.toFixed(1)}</td>
                <td className="p-1"><input className={input + " min-w-[110px]"} aria-label={"GCP " + (index + 1) + " X"} type="number" step="any"
                  key={point.id + "-x-" + crs} defaultValue={Number.isNaN(point.x) ? "" : point.x} onBlur={event => updateGcp(point.id, "x", event.target.value)} /></td>
                <td className="p-1"><input className={input + " min-w-[110px]"} aria-label={"GCP " + (index + 1) + " Y"} type="number" step="any"
                  key={point.id + "-y-" + crs} defaultValue={Number.isNaN(point.y) ? "" : point.y} onBlur={event => updateGcp(point.id, "y", event.target.value)} /></td>
                <td className="p-2 tabular-nums">{residualById.has(point.id) ? residualById.get(point.id)!.toFixed(2) : "—"}</td>
                <td className="p-2 text-center"><button type="button" aria-label={"Eliminar GCP " + (index + 1)}
                  onClick={() => { setGcps(existing => existing.filter(g => g.id !== point.id)); setResult(null); }}
                  className="text-rose-600"><Trash2 size={15} /></button></td>
              </tr>)}
              {!gcps.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">Sem GCPs. Seleccione o primeiro ponto na imagem.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {result && <section className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-3 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="font-bold text-sm text-emerald-700 dark:text-emerald-400">Raster georreferenciado gerado</h3>
          <p className="text-xs text-slate-500">{result.width} × {result.height} px · EPSG:{crs} · RMSE {result.rmsPixels.toFixed(2)} px · GeoTIFF RGBA sem compressão</p>
          {crs !== 4326 && <p className="text-[11px] text-amber-600">
            A pré-visualização Leaflet é aproximada nos SRC projectados; abra o GeoTIFF no QGIS para posicionamento cartográfico exacto.
          </p>}
        </div>
        <button type="button" className={action} onClick={() => downloadBlob(result.geotiff, result.name + "_georreferenciado.tif")}>
          <Download size={15} className="inline mr-1" /> Descarregar GeoTIFF
        </button>
      </section>}
      <p className="text-[11px] text-slate-500 pb-2">
        Formatos de entrada: PNG, JPG, WEBP, BMP (até 32 megapíxeis); saída até 2 800 px por dimensão e 6 MP.
        Para mapas em PDF, converta a página para imagem antes de carregar. A saída contém SRC, transformação e transparência no próprio GeoTIFF.
      </p>
    </div>
  );
}

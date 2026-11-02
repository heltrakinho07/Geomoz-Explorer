import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useAppStore } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import { readRasterPixel } from "@geolibre/plugins";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import { Download, Loader2, MapPinned, Mountain, Pause, Play, RotateCcw, X } from "lucide-react";
import { exportProfileFigure } from "./geomoz-profile-export";
import { profileText, type ProfileCopyKey } from "./geomoz-profile-locales";
import { useLanguage } from "../../hooks/useLanguage";
import { distanceMeters, nearestProfileSampleIndex, profileLocations, profileStatistics, profileToCSV,
  type LonLat, type ProfileSample } from "./geomoz-topographic-profile";

const SOURCE = "geomoz-topo-trace";
const LINE = "geomoz-topo-line";
const DOTS = "geomoz-topo-dots";
const CURSOR_HALO = "geomoz-topo-cursor-halo";
const CURSOR_DOT = "geomoz-topo-cursor-dot";
type Props = { mapControllerRef: RefObject<MapEngine | null>; onClose: () => void };

function features(vertices: LonLat[], cursor: ProfileSample | null): FeatureCollection {
  return { type: "FeatureCollection", features: [
    ...(vertices.length > 1 ? [{ type: "Feature" as const, properties: { kind: "line" },
      geometry: { type: "LineString" as const, coordinates: vertices.map(p => [...p]) } }] : []),
    ...vertices.map((p, index) => ({ type: "Feature" as const,
      properties: { kind: "point", number: index + 1 },
      geometry: { type: "Point" as const, coordinates: [...p] } })),
    ...(cursor ? [{ type: "Feature" as const,
      properties: { kind: "cursor", distanceM: cursor.distanceM, elevationM: cursor.elevationM },
      geometry: { type: "Point" as const, coordinates: [cursor.longitude, cursor.latitude] } }] : []),
  ] };
}
type NativeMap = NonNullable<ReturnType<MapEngine["getMap"]>>;
function paint(map: NativeMap, vertices: LonLat[], cursor: ProfileSample | null) {
  if (!map.isStyleLoaded()) return;
  try {
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: features(vertices, cursor) });
    else (map.getSource(SOURCE) as GeoJSONSource).setData(features(vertices, cursor));
    if (!map.getLayer(LINE)) map.addLayer({ id: LINE, type: "line", source: SOURCE,
      filter: ["==", ["get", "kind"], "line"],
      paint: { "line-color": "#0284c7", "line-width": 3, "line-dasharray": [2, 1] } });
    if (!map.getLayer(DOTS)) map.addLayer({ id: DOTS, type: "circle", source: SOURCE,
      filter: ["==", ["get", "kind"], "point"],
      paint: { "circle-radius": 6, "circle-color": "#0284c7",
        "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
    if (!map.getLayer(CURSOR_HALO)) map.addLayer({ id: CURSOR_HALO, type: "circle", source: SOURCE,
      filter: ["==", ["get", "kind"], "cursor"],
      paint: { "circle-radius": 14, "circle-color": "#f59e0b", "circle-opacity": 0.24 } });
    if (!map.getLayer(CURSOR_DOT)) map.addLayer({ id: CURSOR_DOT, type: "circle", source: SOURCE,
      filter: ["==", ["get", "kind"], "cursor"],
      paint: { "circle-radius": 6, "circle-color": "#f59e0b",
        "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } });
    // MapLibre appends new raster/COG layers after our source when datasets load.
    // Preserve drawing order LINE → vertices → cursor halo → cursor marker at the top.
    // Avoid unconditional moveLayer(): it emits styledata and can loop forever.
    const order = [LINE, DOTS, CURSOR_HALO, CURSOR_DOT];
    const layers = map.getStyle()?.layers ?? [];
    const tail = layers.slice(-order.length).map(layer => layer.id);
    if (order.some((id, i) => tail[i] !== id)) {
      for (const id of order) if (map.getLayer(id)) map.moveLayer(id);
    }
  } catch { /* The next styledata event restores the overlay after a basemap swap. */ }
}
function clear(map: NativeMap) {
  try {
    if (map.getLayer(CURSOR_DOT)) map.removeLayer(CURSOR_DOT);
    if (map.getLayer(CURSOR_HALO)) map.removeLayer(CURSOR_HALO);
    if (map.getLayer(DOTS)) map.removeLayer(DOTS);
    if (map.getLayer(LINE)) map.removeLayer(LINE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  } catch { /* The map or style may have been destroyed. */ }
}
const fmt = (v: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(v);
function Graph({ samples, activeIndex, onCursorChange, t }: {
  samples: ProfileSample[];
  activeIndex: number | null;
  onCursorChange: (index: number | null) => void;
  t: (key: ProfileCopyKey) => string;
}) {
  const stats = profileStatistics(samples);
  const maxDist = samples.at(-1)?.distanceM ?? 1;
  const min = stats?.minElevM ?? 0;
  const max = stats?.maxElevM ?? 1;
  const pad = Math.max(2, (max - min) * 0.1);
  const low = min - pad, high = max + pad;
  const x = (d: number) => 45 + 530 * d / Math.max(1, maxDist);
  const y = (e: number) => 171 - 145 * (e - low) / Math.max(1, high - low);
  const chunks: ProfileSample[][] = [];
  let current: ProfileSample[] = [];
  for (const p of samples) {
    if (p.elevationM === null || !Number.isFinite(p.elevationM)) {
      if (current.length) chunks.push(current);
      current = [];
    } else current.push(p);
  }
  if (current.length) chunks.push(current);
  const selected = activeIndex === null ? null : samples[activeIndex] ?? null;

  const pointFromClientX = (clientX: number, rect: DOMRect) => {
    const position = (clientX - rect.left) * 600 / Math.max(1, rect.width);
    if (position < 45 || position > 575) return null;
    return nearestProfileSampleIndex(samples, (position - 45) * maxDist / 530);
  };
  return <div className="gm-topo-graph">
    <svg viewBox="0 0 600 213" role="group" tabIndex={0}
      aria-label={t("chartAria")}
      onPointerMove={e => onCursorChange(pointFromClientX(
        e.clientX, e.currentTarget.getBoundingClientRect()))}
      onPointerLeave={() => onCursorChange(null)}
      onPointerCancel={() => onCursorChange(null)}
      onKeyDown={e => {
        const last = samples.length - 1;
        if (e.key === "Escape") { onCursorChange(null); return; }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        if (e.key === "Home") onCursorChange(0);
        else if (e.key === "End") onCursorChange(last);
        else if (e.key === "ArrowRight") onCursorChange(Math.min(last, (activeIndex ?? -1) + 1));
        else onCursorChange(Math.max(0, (activeIndex ?? last + 1) - 1));
      }}>
      {[0, 1, 2, 3, 4].map(i => {
        const elev = low + (high - low) * i / 4;
        return <g key={i}>
          <line x1="45" x2="575" y1={y(elev)} y2={y(elev)} stroke="currentColor" strokeOpacity=".15"/>
          <text x="41" y={y(elev) + 4} fontSize="10" textAnchor="end" fill="currentColor">{Math.round(elev)}</text>
        </g>;
      })}
      {chunks.map((chunk, i) => <polyline key={i}
        points={chunk.map(p => String(x(p.distanceM)) + "," + String(y(p.elevationM!))).join(" ")}
        fill="none" stroke="#0284c7" strokeWidth="2.6" strokeLinejoin="round"/>)}
      <line x1="45" x2="575" y1="171" y2="171" stroke="currentColor" strokeOpacity=".5"/>
      {[0, 1, 2, 3, 4].map(i => <text key={i} x={45 + 530 * i / 4} y="191"
        fontSize="11" textAnchor="middle" fill="currentColor">{(maxDist / 1000 * i / 4).toFixed(1)}</text>)}
      <text x="305" y="209" textAnchor="middle" fontSize="11" fill="currentColor">{t("horizontalAxis")}</text>
      {selected && <>
        <line x1={x(selected.distanceM)} x2={x(selected.distanceM)} y1="24" y2="171"
          stroke="#f59e0b" strokeDasharray="4 3"/>
        {selected.elevationM !== null && <circle cx={x(selected.distanceM)}
          cy={y(selected.elevationM)} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="1.5"/>}
      </>}
    </svg>
    {selected && <p className="gm-topo-tooltip" role="status">
      {(selected.distanceM / 1000).toFixed(2)} km · {selected.elevationM === null ? t("dataGap") : fmt(selected.elevationM) + " m"}
      <span> · {selected.latitude.toFixed(5)}°, {selected.longitude.toFixed(5)}°</span>
    </p>}
  </div>;
}
function exportCSV(samples: ProfileSample[], name: string) {
  const source = name.replace(/[\r\n,]/g, " ");
  const file = new Blob(["\uFEFF", "# DEM: " + source + "\r\n", profileToCSV(samples)],
    { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url;
  a.download = "geomoz_perfil_topografico.csv"; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Browser-only tool: samples real pixels of a loaded single-band elevation COG. */
export function GeoMozTopographicProfile({ mapControllerRef, onClose }: Props) {
  const { language } = useLanguage();
  const t = (key: ProfileCopyKey) => profileText(language, key);
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const layers = useAppStore(s => s.layers);
  const demLayers = useMemo(() => layers.filter(layer => layer.type === "cog"), [layers]);
  const [layerId, setLayerId] = useState("");
  const [vertices, setVertices] = useState<LonLat[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [count, setCount] = useState(100);
  const [samples, setSamples] = useState<ProfileSample[] | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const verticesRef = useRef(vertices);
  verticesRef.current = vertices;
  const cursorSample = samples && cursorIndex !== null ? samples[cursorIndex] ?? null : null;
  const cursorSampleRef = useRef<ProfileSample | null>(cursorSample);
  cursorSampleRef.current = cursorSample;
  const chosen = demLayers.find(l => l.id === layerId) ?? demLayers[0];
  const map = mapControllerRef.current?.getMap() ?? null;
  const stats = useMemo(() => samples ? profileStatistics(samples) : null, [samples]);
  const distance = vertices.slice(1).reduce((sum, p, i) => sum + distanceMeters(vertices[i], p), 0);

  useEffect(() => {
    const current = mapControllerRef.current?.getMap();
    if (!current) return;
    const redraw = () => paint(current, verticesRef.current, cursorSampleRef.current);
    redraw();
    current.on("styledata", redraw);
    return () => { current.off("styledata", redraw); clear(current); };
  }, [mapControllerRef]);
  useEffect(() => {
    const current = mapControllerRef.current?.getMap();
    if (current) paint(current, vertices, cursorSample);
  }, [vertices, cursorSample, mapControllerRef]);
  useEffect(() => {
    const current = mapControllerRef.current?.getMap();
    if (!current || !drawing) return;
    const canvas = current.getCanvas();
    const before = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    const handler = (event: MapMouseEvent) => {
      setVertices(previous => previous.length < 30
        ? [...previous, [event.lngLat.lng, event.lngLat.lat] as LonLat] : previous);
      setSamples(null); setCursorIndex(null); setPlaying(false); setError("");
    };
    current.on("click", handler);
    return () => { current.off("click", handler); canvas.style.cursor = before; };
  }, [drawing, mapControllerRef]);
  useEffect(() => () => abortRef.current?.abort(), []);
  // Animate the same real sampled positions used by the chart and MapLibre overlay.
  useEffect(() => {
    if (!playing || !samples?.length) return;
    const timer = window.setInterval(() => {
      setCursorIndex(index => Math.min(samples.length - 1, (index ?? -1) + 1));
    }, Math.max(60, 12000 / samples.length));
    return () => window.clearInterval(timer);
  }, [playing, samples]);
  useEffect(() => {
    if (playing && samples && cursorIndex === samples.length - 1) setPlaying(false);
  }, [playing, samples, cursorIndex]);

  const exportGraph = async (format: "png" | "pdf") => {
    if (!samples || !stats || exporting) return;
    setExporting(format); setError("");
    try {
      await exportProfileFigure(format, chartRef.current?.querySelector("svg") ?? null,
        samples, stats, chosen?.name ?? "DEM", language, t);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally { setExporting(null); }
  };
  const reset = () => {
    abortRef.current?.abort(); setVertices([]); setSamples(null);
    setCursorIndex(null); setPlaying(false);
    setError(""); setDrawing(false); setBusy(false);
  };
  const compute = async () => {
    if (!chosen || vertices.length < 2 || busy || drawing) return;
    setBusy(true); setError(""); setSamples(null); setCursorIndex(null); setPlaying(false);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    try {
      const targets = profileLocations(vertices, count);
      const output = [...targets];
      let index = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (index < targets.length && !controller.signal.aborted) {
          const i = index++;
          const p = targets[i];
          const reading = await readRasterPixel(chosen.id, [p.longitude, p.latitude],
            { signal: controller.signal });
          if (controller.signal.aborted) break;
          const band = reading?.bands?.[0];
          const value = band?.value;
          output[i] = { ...p, elevationM: band && !band.isNodata &&
            typeof value === "number" && Number.isFinite(value) ? value : null };
        }
      }));
      if (controller.signal.aborted) return;
      const calculated = profileStatistics(output);
      if (!calculated) throw Error("O raster não contém elevações válidas ao longo do traçado.");
      setSamples(output);
      if (calculated.validCount !== calculated.sampleCount) setError(
        String(calculated.sampleCount - calculated.validCount) +
        " amostras sem valores (NoData); as lacunas não foram interpoladas.");
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Não foi possível calcular o perfil.");
    } finally {
      if (abortRef.current === controller) { abortRef.current = null; setBusy(false); }
    }
  };
  return <section className="gm-topo-panel" role="dialog" aria-modal="false"
    aria-label={t("profile")} data-testid="geomoz-topographic-profile">
    <header className="gm-topo-heading"><div>
      <small>{t("category")}</small>
      <h2><Mountain size={18}/> {t("profile")}</h2>
      <p>{t("subtitle")}</p></div>
      <button type="button" onClick={onClose} aria-label={t("close")}><X size={17}/></button>
    </header>
    <div className="gm-topo-body">
      <label>{t("dem")}
        <select aria-label={t("dem")} value={chosen?.id ?? ""}
          onChange={e => { abortRef.current?.abort(); setLayerId(e.target.value);
            setSamples(null); setCursorIndex(null); setPlaying(false); setError(""); setBusy(false); }}>
          {!chosen && <option value="">{t("noDem")}</option>}
          {demLayers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
        </select>
      </label>
      {!chosen && <p role="status" className="gm-topo-note">
        {t("loadDem")}
      </p>}
      <div className="gm-topo-actions">
        <button type="button" data-testid="geomoz-topo-draw" onClick={() => setDrawing(!drawing)}
          aria-pressed={drawing} disabled={busy || !map}><MapPinned size={15}/>
          {drawing ? t("endDrawing") : t("draw")}</button>
        <button type="button" onClick={reset}><RotateCcw size={14}/> {t("clear")}</button>
      </div>
      {drawing && <p role="status" className="gm-topo-note">
        {t("drawHint")}
      </p>}
      {!map && <p role="alert">{t("requireMap")}</p>}
      <p className="gm-topo-note">{vertices.length} {t("vertices")} · {(distance / 1000).toFixed(2)} km</p>
      <label>{t("sampleCount")}
        <input aria-label={t("sampleCount")} type="number" min="20" max="300"
          step="10" value={count} onChange={e => {
            setCount(Math.min(300, Math.max(20, Number(e.target.value) || 20)));
            setSamples(null); setCursorIndex(null); setPlaying(false);
          }}/>
      </label>
      <button type="button" className="gm-topo-run" onClick={() => void compute()}
        disabled={!chosen || vertices.length < 2 || drawing || busy}>
        {busy ? <Loader2 size={16}/> : <Mountain size={16}/>}
        {busy ? t("loading") : t("compute")}</button>
      {error && <p role="alert" className="gm-topo-error">{error}</p>}
      {samples && stats && <>
        <div className="gm-topo-stats">
          <span><small>{t("distance")}</small><b>{(stats.totalDistanceM / 1000).toFixed(2)} km</b></span>
          <span><small>{t("minimum")}</small><b>{fmt(stats.minElevM)} m</b></span>
          <span><small>{t("maximum")}</small><b>{fmt(stats.maxElevM)} m</b></span>
          <span><small>{t("mean")}</small><b>{fmt(stats.meanElevM)} m</b></span>
          <span><small>{t("ascent")}</small><b>+{fmt(stats.gainM)} m</b></span>
          <span><small>{t("descent")}</small><b>−{fmt(stats.lossM)} m</b></span>
        </div>
        <div ref={chartRef}><Graph samples={samples} activeIndex={cursorIndex}
          onCursorChange={index => { setPlaying(false); setCursorIndex(index); }} t={t}/></div>
        <div className="gm-topo-navigation">
          <p className="gm-topo-note">
            {t("sampleNote")}
          </p>
          <button type="button" data-testid="geomoz-topo-play" aria-pressed={playing}
            onClick={() => {
              if (playing) { setPlaying(false); return; }
              setCursorIndex(previous => previous === null || previous >= samples.length - 1
                ? 0 : previous);
              setPlaying(true);
            }}>
            {playing ? <Pause size={14}/> : <Play size={14}/>}
            {playing ? t("pause") : t("animate")}
          </button>
        </div>
        <p className="gm-topo-note">{t("source")}: {chosen?.name}. {stats.validCount}/{stats.sampleCount} {t("validSamples")}.
          {t("sourceNote")}</p>
        <div className="gm-topo-export-list">
          <button type="button" className="gm-topo-export" onClick={() => exportCSV(samples, chosen?.name ?? "DEM")}>
            <Download size={15}/> {t("csv")}
          </button>
          <button type="button" className="gm-topo-export" disabled={!!exporting}
            onClick={() => void exportGraph("png")} data-testid="geomoz-topo-export-png">
            <Download size={15}/> {exporting === "png" ? t("exportBusy") : t("png")}
          </button>
          <button type="button" className="gm-topo-export" disabled={!!exporting}
            onClick={() => void exportGraph("pdf")} data-testid="geomoz-topo-export-pdf">
            <Download size={15}/> {exporting === "pdf" ? t("exportBusy") : t("pdf")}
          </button>
        </div>
      </>}
      <footer>{t("method")}</footer>
    </div>
  </section>;
}

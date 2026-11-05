import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { aiAgentText, type AiAgentCopyKey } from "@/i18n/aiAgent";
import { agentHttpError } from "@/i18n/aiDiagnostics";
import type { TemporalReplay } from "@/types/project";

export interface TemporalQuality {
  calendarAligned: boolean;
  durationDays: { A: number; B: number };
  sceneCounts: { A: number; B: number };
  commonValidCoveragePercent: number;
  status: string;
  warnings: string[];
  note: string;
}
type Bin = { min: number; count: number };
type HistResponse = { histograms: { A: Bin[]; B: Bin[]; Delta: Bin[] }; analysisScaleM: number; note: string };
type TiffResponse = { downloadUrl: string; dimensions: number[]; estimatedGridScaleM: number;
  requestedScaleM: number; resolutionAdjusted: boolean; bands: string[]; note: string };

const validBins = (value: unknown): value is Bin[] =>
  Array.isArray(value) && value.every((bin) => bin && typeof bin.min === "number" && Number.isFinite(bin.min)
    && typeof bin.count === "number" && Number.isFinite(bin.count) && bin.count >= 0);

function HistogramPlot({ bins, label, unit }: { bins: Bin[]; label: string; unit: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const max = Math.max(...bins.map((bin) => bin.count), 1);
  const width = 540;
  return (
    <div className="space-y-1">
      <svg viewBox="0 0 560 145" role="img" aria-label={label + " · " + unit} className="w-full">
        <line x1="12" x2="550" y1="123" y2="123" stroke="currentColor" opacity="0.3" />
        {bins.map((bin, i) => {
          const x = 12 + (width * i) / bins.length;
          const h = 106 * bin.count / max;
          return <rect key={i} x={x} y={123 - h} width={Math.max(1, width / bins.length - 2)}
            height={h} fill={selected === i ? "#7c3aed" : "#0d9488"} opacity={selected === null || selected === i ? 1 : 0.6}
            role="button" tabIndex={0}
            onClick={() => setSelected(i)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(i); } }}
            aria-label={`Intervalo ${bin.min.toFixed(3)}, contagem ${bin.count.toFixed(1)}`}>
            <title>{`${bin.min.toFixed(3)} · ${bin.count.toFixed(1)} pixels ponderados`}</title>
          </rect>;
        })}
        {bins.length > 0 && <>
          <text x="12" y="139" fontSize="10" fill="currentColor">{bins[0].min.toFixed(2)}</text>
          <text x="550" y="139" fontSize="10" fill="currentColor" textAnchor="end">{bins[bins.length - 1].min.toFixed(2)}+</text>
        </>}
      </svg>
      <p className="text-[10px] text-slate-600 dark:text-slate-300" aria-live="polite">
        {selected === null ? `${bins.length} intervalos · ${total.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} pixels ponderados`
          : `≥ ${bins[selected].min.toFixed(3)} · ${bins[selected].count.toFixed(1)} pixels ponderados (${total ? (100 * bins[selected].count / total).toFixed(1) : "0"}%)`}
      </p>
    </div>
  );
}

export function GeoTemporalAnalysisPanel({ replay, quality, disabled, onExportPdf, onExportPng }: {
  replay: TemporalReplay;
  quality?: TemporalQuality | null;
  disabled: boolean;
  onExportPdf: () => Promise<void>;
  onExportPng: () => Promise<void>;
}) {
  const { translatedLocale } = usePortalTranslation();
  const t = (key: AiAgentCopyKey) => aiAgentText(translatedLocale, key);
  const [hist, setHist] = useState<HistResponse | null>(null);
  const [series, setSeries] = useState<"A" | "B" | "Delta">("A");
  const [tiff, setTiff] = useState<TiffResponse | null>(null);
  const [busy, setBusy] = useState<"hist" | "tiff" | "map" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const recipeKey = JSON.stringify(replay);

  useEffect(() => {
    abort.current?.abort();
    setHist(null);
    setTiff(null);
    setError(null);
    setSeries("A");
    setBusy(null);
    return () => abort.current?.abort();
  }, [recipeKey]);

  async function request(mode: "hist" | "tiff") {
    if (disabled || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(mode);
    setError(null);
    try {
      const endpoint = mode === "hist" ? "/geomoz-api/ai/temporal-histogram" : "/geomoz-api/ai/temporal-geotiff";
      const response = await apiFetch(endpoint, {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...replay.args, aoi: replay.aoi }),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        throw new Error(agentHttpError(translatedLocale, response.status, problem?.detail, response.headers.get("X-Request-ID")));
      }
      if (mode === "hist") {
        const data = await response.json() as HistResponse;
        if (!validBins(data.histograms?.A) || !validBins(data.histograms?.B) || !validBins(data.histograms?.Delta))
          throw new Error(t("temporal.badHist"));
        if (!controller.signal.aborted) setHist(data);
      } else {
        const data = await response.json() as TiffResponse;
        if (new URL(data.downloadUrl).protocol !== "https:") throw new Error(t("temporal.badExport"));
        if (!controller.signal.aborted) setTiff(data);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : t("temporal.requestError"));
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  async function exportMap(mode: "png" | "pdf") {
    if (disabled || busy) return;
    setBusy("map");
    setError(null);
    try { await (mode === "pdf" ? onExportPdf() : onExportPng()); }
    catch (err) { setError(err instanceof Error ? err.message : t("temporal.requestError")); }
    finally { setBusy(null); }
  }

  const seriesBins = hist?.histograms?.[series] || [];
  return (
    <section aria-label={t("temporal.title")} className="mx-3 my-2 space-y-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-xs dark:border-teal-900 dark:bg-teal-950/20">
      <h3 className="font-bold text-slate-800 dark:text-slate-100">{t("temporal.title")} · {replay.args.index.toUpperCase()}</h3>
      <p className="text-[11px] text-slate-600 dark:text-slate-300">
        A: {replay.args.start_date_1} → {replay.args.end_date_1} · B: {replay.args.start_date_2} → {replay.args.end_date_2}
      </p>
      {quality && (
        <div role="note" className="space-y-1 rounded-lg bg-white/80 p-2 text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <div className="font-semibold">{t("temporal.quality")} · {quality.calendarAligned ? t("temporal.aligned") : t("temporal.review")}</div>
          <p>{t("temporal.scenes")}: A {quality.sceneCounts.A} / B {quality.sceneCounts.B} · {t("temporal.coverage")}: {quality.commonValidCoveragePercent.toFixed(1)}%</p>
          <p>{t("temporal.days")}: A {quality.durationDays.A} / B {quality.durationDays.B}</p>
          {quality.warnings.map((warning, i) => <p key={i} className="font-medium text-amber-800 dark:text-amber-300">{warning}</p>)}
          <p className="text-[10px] text-slate-500">{quality.note}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={disabled || busy !== null} onClick={() => void request("hist")}
          className="rounded-md bg-teal-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">{busy === "hist" ? "…" : t("temporal.histograms")}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void request("tiff")}
          className="rounded-md bg-violet-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">{busy === "tiff" ? "…" : t("temporal.geotiff")}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void exportMap("png")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{t("temporal.png")}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void exportMap("pdf")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{t("temporal.pdf")}</button>
      </div>
      {error && <p role="alert" className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
      {hist && <div className="space-y-2 rounded-lg border border-teal-200 bg-white p-2 dark:border-teal-900 dark:bg-slate-900">
        <div className="flex gap-1" role="group" aria-label={t("temporal.selectSeries")}>
          {(["A", "B", "Delta"] as const).map((key) => <button key={key} type="button"
            aria-pressed={series === key} onClick={() => setSeries(key)}
            className={`rounded px-3 py-1 text-[11px] font-semibold ${series === key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{key === "Delta" ? "Δ" : key}</button>)}
        </div>
        {seriesBins.length > 0 ? <HistogramPlot key={series} bins={seriesBins} label={series} unit={t("temporal.histograms")} /> : <p>{t("temporal.noPixels")}</p>}
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{hist.note} · {hist.analysisScaleM} m</p>
      </div>}
      {tiff && <div className="space-y-1 rounded-lg bg-white p-2 dark:bg-slate-900">
        <a href={tiff.downloadUrl} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-violet-700 underline dark:text-violet-300">{t("temporal.downloadReady")}</a>
        <p>{tiff.bands.join(" / ")} · {tiff.dimensions.join(" × ")} px</p>
        {tiff.resolutionAdjusted && <p className="font-semibold text-amber-800 dark:text-amber-300">{t("temporal.adjusted")}: {tiff.requestedScaleM} m → {tiff.estimatedGridScaleM} m</p>}
        <p className="text-[10px] text-slate-500">{tiff.note}</p>
      </div>}
    </section>
  );
}

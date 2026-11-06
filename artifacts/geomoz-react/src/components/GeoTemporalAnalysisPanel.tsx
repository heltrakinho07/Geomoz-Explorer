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
  warningCodes?: string[];
  note: string;
}
type Bin = { min: number; count: number };
type HistResponse = { histograms: { A: Bin[]; B: Bin[]; Delta: Bin[] }; analysisScaleM: number; note: string };
type TiffResponse = { downloadUrl: string; dimensions: number[]; estimatedGridScaleM: number;
  requestedScaleM: number; resolutionAdjusted: boolean; bands: string[]; note: string };


type MonthlyRow = { month: string; startDate: string; endDate: string;
  mean: number | null; sceneCount: number; validPixelCount: number };
type MonthlyResponse = { months: { A: MonthlyRow[]; B: MonthlyRow[] };
  analysisScaleM: number; note: string };

function MonthlySeriesChart({ data }: { data: MonthlyResponse }) {
  const [hover, setHover] = useState<{ period: "A" | "B"; i: number } | null>(null);
  const width = 560, height = 200, left = 42, right = 15, top = 15, bottom = 30;
  const usableWidth = width - left - right, usableHeight = height - top - bottom;
  const maxPoints = Math.max(data.months.A.length, data.months.B.length, 2);
  const x = (i: number) => left + usableWidth * i / (maxPoints - 1);
  const y = (value: number) => top + usableHeight * (1 - (value + 1) / 2);
  const points = (rows: MonthlyRow[]) => rows.map((row,i) => ({...row,i}));
  return <div className="space-y-2">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Série mensal de índice, períodos A e B" className="w-full">
      {([-1,-0.5,0,0.5,1] as const).map(v => <g key={v}>
        <line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".15"/>
        <text x={left-6} y={y(v)+3} fill="currentColor" textAnchor="end" fontSize="10">{v.toFixed(1)}</text>
      </g>)}
      {(["A","B"] as const).map((key) => {
        const rows=points(data.months[key]);const color=key==="A"?"#2563eb":"#ea580c";
        const segments: Array<Array<typeof rows[number]>>=[];let segment: typeof rows=[];
        rows.forEach(row=>{if(row.mean===null){if(segment.length)segments.push(segment);segment=[];}else{segment.push(row);}});
        if(segment.length)segments.push(segment);
        return <g key={key}>
          {segments.map((entries,i) => entries.length>1?<polyline key={i} fill="none" stroke={color} strokeWidth="2.5"
            points={entries.map(row=>`${x(row.i)},${y(row.mean!)}`).join(" ")}/>:null)}
          {rows.filter(row=>row.mean!==null).map(row=><circle key={row.month} cx={x(row.i)} cy={y(row.mean!)}
            r={hover?.period===key && hover.i===row.i?6:3.5} fill={color} role="button" tabIndex={0}
            aria-label={`${key} ${row.month}: ${row.mean!.toFixed(3)}`}
            onMouseEnter={()=>setHover({period:key,i:row.i})}
            onFocus={()=>setHover({period:key,i:row.i})}
            onMouseLeave={()=>setHover(null)}
            onKeyDown={event=>{if(event.key==="Enter")setHover({period:key,i:row.i});}}/>)}
        </g>;
      })}
      <text x={left} y={height-8} fontSize="10" fill="currentColor">Mês 1</text>
      <text x={width-right} y={height-8} textAnchor="end" fontSize="10" fill="currentColor">Mês {maxPoints}</text>
    </svg>
    <div className="flex gap-4 text-[11px] text-slate-700 dark:text-slate-200">
      <span><span className="font-bold text-blue-600">●</span> Período A</span>
      <span><span className="font-bold text-orange-600">●</span> Período B</span>
    </div>
    {hover && (()=>{const r=data.months[hover.period][hover.i];return r?
      <p role="status" className="text-[11px]">{hover.period} · {r.month} · {r.mean===null?"Sem dados":r.mean.toFixed(4)}
      · {r.sceneCount} cenas · {r.validPixelCount} pixels</p>:null;})()}
    <div className="overflow-x-auto"><table className="w-full text-left text-[10px]">
      <thead><tr><th>Período</th><th>Mês</th><th>Média</th><th>Cenas</th><th>Pixels</th></tr></thead>
      <tbody>{(["A","B"] as const).flatMap(key=>data.months[key].map(row=><tr key={key+row.month}>
        <td>{key}</td><td>{row.month}</td><td>{row.mean===null?"—":row.mean.toFixed(4)}</td>
        <td>{row.sceneCount}</td><td>{row.validPixelCount}</td></tr>))}</tbody>
    </table></div>
    <p className="text-[10px] text-slate-500 dark:text-slate-400">{data.note} · {data.analysisScaleM} m</p>
  </div>;
}

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
  const [monthly, setMonthly] = useState<MonthlyResponse | null>(null);
  const [busy, setBusy] = useState<"hist" | "tiff" | "map" | "monthly" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const recipeKey = JSON.stringify(replay);

  useEffect(() => {
    abort.current?.abort();
    setHist(null);
    setTiff(null);
    setMonthly(null);
    setError(null);
    setSeries("A");
    setBusy(null);
    return () => abort.current?.abort();
  }, [recipeKey]);

  async function request(mode: "hist" | "tiff" | "monthly") {
    if (disabled || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(mode);
    setError(null);
    try {
      const endpoint = mode === "hist" ? "/geomoz-api/ai/temporal-histogram" : mode === "monthly"
        ? "/geomoz-api/ai/temporal-monthly-series" : "/geomoz-api/ai/temporal-geotiff";
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
      } else if (mode === "monthly") {
        const data = await response.json() as MonthlyResponse;
        const validRows = (rows: unknown): rows is MonthlyRow[] =>
          Array.isArray(rows) && rows.every(row=>row && typeof row.month==="string" &&
            (row.mean===null || typeof row.mean==="number" && Number.isFinite(row.mean)) &&
            Number.isInteger(row.sceneCount) && row.sceneCount>=0);
        if (!validRows(data.months?.A) || !validRows(data.months?.B))
          throw new Error(t("temporal.badHist"));
        if (!controller.signal.aborted) setMonthly(data);
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
          {(quality.warningCodes || []).map((code, i) => {
            const key = code === "season" ? "temporal.seasonWarning" : code === "scenes"
              ? "temporal.sceneWarning" : "temporal.coverageWarning";
            return <p key={i} className="font-medium text-amber-800 dark:text-amber-300">{t(key)}</p>;
          })}
          <p className="text-[10px] text-slate-500">{t("temporal.qualityNote")}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={disabled || busy !== null} onClick={() => void request("hist")}
          className="rounded-md bg-teal-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">{busy === "hist" ? "…" : t("temporal.histograms")}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void request("monthly")}
          className="rounded-md bg-blue-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">
          {busy === "monthly" ? "…" : "Série mensal A/B"}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void request("tiff")}
          className="rounded-md bg-violet-700 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">{busy === "tiff" ? "…" : t("temporal.geotiff")}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void exportMap("png")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{t("temporal.png")}</button>
        <button type="button" disabled={disabled || busy !== null} onClick={() => void exportMap("pdf")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{t("temporal.pdf")}</button>
      </div>
      {error && <p role="alert" className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
      {monthly && <div className="rounded-lg border border-blue-200 bg-white p-2 dark:border-blue-900 dark:bg-slate-900">
        <MonthlySeriesChart data={monthly} />
      </div>}
      {hist && <div className="space-y-2 rounded-lg border border-teal-200 bg-white p-2 dark:border-teal-900 dark:bg-slate-900">
        <div className="flex gap-1" role="group" aria-label={t("temporal.selectSeries")}>
          {(["A", "B", "Delta"] as const).map((key) => <button key={key} type="button"
            aria-pressed={series === key} onClick={() => setSeries(key)}
            className={`rounded px-3 py-1 text-[11px] font-semibold ${series === key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{key === "Delta" ? "Δ" : key}</button>)}
        </div>
        {seriesBins.length > 0 ? <HistogramPlot key={series} bins={seriesBins} label={series} unit={t("temporal.histograms")} /> : <p>{t("temporal.noPixels")}</p>}
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("temporal.pixelCount")} · {hist.analysisScaleM} m</p>
      </div>}
      {tiff && <div className="space-y-1 rounded-lg bg-white p-2 dark:bg-slate-900">
        <a href={tiff.downloadUrl} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-violet-700 underline dark:text-violet-300">{t("temporal.downloadReady")}</a>
        <p>{tiff.bands.join(" / ")} · {tiff.dimensions.join(" × ")} px</p>
        {tiff.resolutionAdjusted && <p className="font-semibold text-amber-800 dark:text-amber-300">{t("temporal.adjusted")}: {tiff.requestedScaleM} m → {tiff.estimatedGridScaleM} m</p>}
        <p className="text-[10px] text-slate-500">{t("temporal.geotiffNote")}</p>
      </div>}
    </section>
  );
}

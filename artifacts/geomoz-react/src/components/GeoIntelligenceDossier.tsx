import { GeoAgentCharts } from "./GeoAgentCharts";

import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { aiDiagnosticText, localizedAgentWarning, type AiDiagnosticKey } from "@/i18n/aiDiagnostics";

export interface IntelligenceDossier {
  version: string;
  id: string;
  generatedAt: string;
  status: string;
  scope: { label?: string; province?: string; district?: string };
  period: { startDate?: string; endDate?: string; A?: { startDate: string; endDate: string }; B?: { startDate: string; endDate: string } };
  successfulTools: number;
  failedTools: number;
  limitations: string[];
  evidence: Array<{
    id: string;
    tool: string;
    status: string;
    parameters: Record<string, unknown>;
    period?: { A?: { startDate: string; endDate: string }; B?: { startDate: string; endDate: string } };
    source?: unknown;
    durationMs?: number;
    result: Record<string, unknown>;
  }>;
}

const statusKeys: Record<string, AiDiagnosticKey> = {
  completed: "dossier.status.completed", partial: "dossier.status.partial", error: "dossier.status.error",
  unverified: "dossier.status.unverified", needs_input: "dossier.status.needs_input", reference: "dossier.status.reference",
};

export function GeoIntelligenceDossier({ dossier }: { dossier: IntelligenceDossier }) {
  const comparison = dossier.evidence.find((entry) => entry.status === "success" && entry.tool === "detect_temporal_change")?.period;
  const periodA = dossier.period.A || comparison?.A;
  const periodB = dossier.period.B || comparison?.B;
  const { translatedLocale } = usePortalTranslation();
  const t = (key: AiDiagnosticKey) => aiDiagnosticText(translatedLocale, key);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `GeoMoz-Geointeligencia-${dossier.id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
    <GeoAgentCharts evidence={dossier.evidence} />
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60">
      <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
        {t("dossier.title")} · {statusKeys[dossier.status] ? t(statusKeys[dossier.status]) : dossier.status}
      </summary>
      <div className="mt-3 space-y-3 text-slate-600 dark:text-slate-300">
        <p>{dossier.scope.label || [dossier.scope.district, dossier.scope.province].filter(Boolean).join(", ") || t("dossier.noArea")}
          {periodA && periodB
            ? ` · A: ${periodA.startDate} → ${periodA.endDate} · B: ${periodB.startDate} → ${periodB.endDate} (fins exclusivos)`
            : dossier.period.startDate && ` · ${dossier.period.startDate} → ${dossier.period.endDate || "—"}`}</p>
        <p>{dossier.successfulTools} {t("dossier.completedTools")} · {dossier.failedTools} {t("dossier.failedTools")}</p>
        {dossier.limitations.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-amber-800 dark:text-amber-300">
            {dossier.limitations.map((text, i) => <li key={i}>{localizedAgentWarning(translatedLocale, text)}</li>)}
          </ul>
        )}
        {dossier.evidence.map((record) => (
          <details key={record.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <summary className="cursor-pointer break-words">
              {record.status === "success" ? "✓" : "!"} {record.tool.replaceAll("_", " ")}
              {record.durationMs !== undefined && ` · ${(record.durationMs / 1000).toFixed(1)} s`}
            </summary>
            <p className="mt-2 break-words">{t("dossier.source")} {record.source ? (typeof record.source === "string" ? record.source : JSON.stringify(record.source)) : t("dossier.noSource")}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px]">{JSON.stringify({ parametros: record.parameters, resultado: record.result }, null, 2)}</pre>
          </details>
        ))}
        <button type="button" onClick={download} className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white hover:bg-violet-700">{t("dossier.export")}</button>
        <p className="break-all text-[10px] text-slate-400">{dossier.id} · {dossier.generatedAt}</p>
      </div>
    </details>
    </>
  );
}

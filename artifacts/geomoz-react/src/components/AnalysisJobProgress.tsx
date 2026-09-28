import {
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  XCircle,
} from "lucide-react";
import type { AnalysisJob } from "@/hooks/useAnalysisJob";

interface AnalysisJobProgressProps {
  job: AnalysisJob<unknown> | null;
  title?: string;
  onCancel?: () => unknown | Promise<unknown>;
  onRetry?: () => unknown | Promise<unknown>;
}

const STEPS = [
  { at: 0, label: "Na fila" },
  { at: 10, label: "Validar" },
  { at: 25, label: "Preparar" },
  { at: 50, label: "Processar" },
  { at: 90, label: "Resultado" },
];

function durationMs(from?: string | null, toMs = Date.now()) {
  if (!from) return null;
  const startMs = Date.parse(from);
  if (!Number.isFinite(startMs)) return null;
  return Math.max(0, toMs - startMs);
}

function formatDuration(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1_000) return "<1 s";
  const totalSeconds = Math.round(ms / 1_000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} min ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export default function AnalysisJobProgress({
  job,
  title = "Progresso da análise",
  onCancel,
  onRetry,
}: AnalysisJobProgressProps) {
  if (!job) return null;

  const failed = job.status === "failed";
  const completed = job.status === "completed";
  const cancelled = job.status === "cancelled";
  const progress = Math.max(0, Math.min(job.progress || 0, 100));
  const activeAt = STEPS.reduce((latest, step) => progress >= step.at ? step.at : latest, 0);

  const nowMs = Date.now();
  const createdMs = Date.parse(job.created_at);
  const startedMs = job.started_at ? Date.parse(job.started_at) : Number.NaN;
  const completedMs = job.completed_at ? Date.parse(job.completed_at) : Number.NaN;

  const queueMs =
    job.timings?.queue_wait_ms ??
    (Number.isFinite(startedMs) && Number.isFinite(createdMs)
      ? Math.max(0, startedMs - createdMs)
      : job.status === "queued"
        ? durationMs(job.created_at, nowMs)
        : null);

  const executionMs =
    job.timings?.execution_ms ??
    (Number.isFinite(startedMs)
      ? Math.max(
          0,
          (Number.isFinite(completedMs) ? completedMs : nowMs) - startedMs,
        )
      : null);

  const totalMs =
    job.timings?.total_ms ??
    (Number.isFinite(createdMs)
      ? Math.max(
          0,
          (Number.isFinite(completedMs) ? completedMs : nowMs) - createdMs,
        )
      : null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {title}
          </div>
          <div className="mt-0.5 text-xs font-medium text-slate-700">
            {job.message || "A processar análise…"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onRetry && (job.status === "failed" || job.status === "cancelled") && (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="rounded-full border border-sky-200 px-2 py-1 text-[10px] font-semibold text-sky-600 transition hover:bg-sky-50"
            >
              Repetir
            </button>
          )}
          {onCancel && (job.status === "queued" || job.status === "processing") && (
            <button
              type="button"
              onClick={() => void onCancel()}
              className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Cancelar
            </button>
          )}
          <div className={[
          "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
          failed
            ? "bg-red-50 text-red-700"
            : completed
              ? "bg-emerald-50 text-emerald-700"
              : job.status === "cancelled"
                ? "bg-slate-100 text-slate-600"
                : "bg-sky-50 text-sky-700",
        ].join(" ")}>
          {failed ? (
            <XCircle size={11} />
          ) : completed ? (
            <CheckCircle2 size={11} />
          ) : cancelled ? (
            <Circle size={11} />
          ) : (
            <Loader2 size={11} className="animate-spin" />
          )}
          {failed ? "Falhou" : completed ? "Concluída" : cancelled ? "Cancelada" : `${progress}%`}
          </div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={[
            "h-full rounded-full transition-all duration-500",
            failed ? "bg-red-500" : completed ? "bg-emerald-500" : cancelled ? "bg-slate-400" : "bg-sky-500",
          ].join(" ")}
          style={{ width: `${failed ? Math.max(progress, 8) : progress}%` }}
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          ["Fila", queueMs],
          ["Processamento", executionMs],
          ["Total", totalMs],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-slate-50 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-slate-400">
              <Clock3 size={9} />
              {label}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
              {formatDuration(value as number | null)}
            </div>
          </div>
        ))}
      </div>

      {(job.execution_mode || (job.attempt ?? 0) > 1) && (
        <div className="mt-1.5 text-[9px] text-slate-400">
          {job.execution_mode === "cloud_tasks"
            ? "Worker distribuído"
            : job.execution_mode === "local_executor"
              ? "Worker local"
              : job.execution_mode || ""}
          {(job.attempt ?? 0) > 1 ? ` · tentativa ${job.attempt}` : ""}
        </div>
      )}

      <div className="mt-3 grid grid-cols-5 gap-1">
        {STEPS.map((step) => {
          const done = completed || progress >= step.at;
          const active = !completed && !failed && done && activeAt === step.at;

          return (
            <div key={step.label} className="min-w-0 text-center">
              <div className="flex justify-center">
                {done ? (
                  active ? (
                    <Loader2 size={11} className="animate-spin text-sky-500" />
                  ) : (
                    <CheckCircle2 size={11} className="text-emerald-500" />
                  )
                ) : (
                  <Circle size={11} className="text-slate-300" />
                )}
              </div>
              <div className={[
                "mt-1 truncate text-[9px]",
                done ? "text-slate-600" : "text-slate-300",
              ].join(" ")}>
                {step.label}
              </div>
            </div>
          );
        })}
      </div>

      {job.error?.message && (
        <div className="mt-3 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-relaxed text-red-700">
          {job.error.message}
        </div>
      )}
    </div>
  );
}

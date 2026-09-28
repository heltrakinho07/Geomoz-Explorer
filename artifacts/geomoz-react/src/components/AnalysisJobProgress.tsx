import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import type { AnalysisJob } from "@/hooks/useAnalysisJob";

interface AnalysisJobProgressProps {
  job: AnalysisJob<unknown> | null;
  title?: string;
  onCancel?: () => void | Promise<void>;
}

const STEPS = [
  { at: 0, label: "Na fila" },
  { at: 10, label: "Validar" },
  { at: 25, label: "Preparar" },
  { at: 50, label: "Processar" },
  { at: 90, label: "Resultado" },
];

export default function AnalysisJobProgress({
  job,
  title = "Progresso da análise",
  onCancel,
}: AnalysisJobProgressProps) {
  if (!job) return null;

  const failed = job.status === "failed";
  const completed = job.status === "completed";
  const progress = Math.max(0, Math.min(job.progress || 0, 100));
  const activeAt = STEPS.reduce((latest, step) => progress >= step.at ? step.at : latest, 0);

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
          ) : (
            <Loader2 size={11} className="animate-spin" />
          )}
          {failed ? "Falhou" : completed ? "Concluída" : job.status === "cancelled" ? "Cancelada" : `${progress}%`}
          </div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={[
            "h-full rounded-full transition-all duration-500",
            failed ? "bg-red-500" : completed ? "bg-emerald-500" : "bg-sky-500",
          ].join(" ")}
          style={{ width: `${failed ? Math.max(progress, 8) : progress}%` }}
        />
      </div>

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

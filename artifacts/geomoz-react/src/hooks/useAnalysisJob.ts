import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useProject } from "@/hooks/useProject";

export type AnalysisJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface AnalysisJobError {
  code?: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export interface AnalysisJob<T = unknown> {
  id: string;
  type: string;
  project_id?: string | null;
  status: AnalysisJobStatus;
  stage: string | null;
  progress: number;
  message: string | null;
  payload: Record<string, unknown>;
  result: T | null;
  error: AnalysisJobError | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  execution_mode?: string;
}

const ACTIVE_STATUSES = new Set<AnalysisJobStatus>(["queued", "processing"]);

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body?.detail === "string") return body.detail;
  if (typeof body?.message === "string") return body.message;
  return `Erro HTTP ${res.status}`;
}

export function useAnalysisJob<T = unknown>(pollIntervalMs = 1200) {
  const { activeProject } = useProject();
  const [job, setJob] = useState<AnalysisJob<T> | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (jobId?: string) => {
    const id = jobId || job?.id;
    if (!id) return null;

    const res = await apiFetch(`/geomoz-api/jobs/${id}`);
    if (!res.ok) {
      throw new Error(await parseError(res));
    }

    const data = (await res.json()) as AnalysisJob<T>;
    if (mounted.current) setJob(data);
    return data;
  }, [job?.id]);

  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await refresh(job.id);
        if (!cancelled && next?.error?.message) {
          setRequestError(next.error.message);
        }
      } catch (err) {
        if (!cancelled && mounted.current) {
          setRequestError(err instanceof Error ? err.message : String(err));
        }
      }
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job, pollIntervalMs, refresh]);

  const submitJob = useCallback(async (
    type: string,
    payload: Record<string, unknown>,
  ) => {
    setRequestError(null);
    setSubmitting(true);

    try {
      const res = await apiFetch("/geomoz-api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, project_id: activeProject?.id ?? null }),
    });

      if (!res.ok) {
        const message = await parseError(res);
        setRequestError(message);
        throw new Error(message);
      }

      const created = (await res.json()) as AnalysisJob<T>;
      if (mounted.current) setJob(created);
      return created;
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }, [activeProject?.id]);

  const resetJob = useCallback(() => {
    setJob(null);
    setRequestError(null);
  }, []);

  return {
    job,
    submitJob,
    refresh,
    resetJob,
    running: submitting || (!!job && ACTIVE_STATUSES.has(job.status)),
    submitting,
    completed: job?.status === "completed",
    failed: job?.status === "failed",
    result: job?.result ?? null,
    error: job?.error?.message || requestError,
  };
}

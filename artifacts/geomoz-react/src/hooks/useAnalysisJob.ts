import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useProject } from "@/hooks/useProject";
import { useWorkspaceLayers } from "@/hooks/useWorkspaceLayers";

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
  const { upsertResultLayer } = useWorkspaceLayers();
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

  const registerCompletedLayer = useCallback((completedJob: AnalysisJob<T>) => {
    if (completedJob.status !== "completed" || !completedJob.result) return;

    const result = completedJob.result as Record<string, unknown>;
    const tileUrl = typeof result.tileUrl === "string" ? result.tileUrl : null;
    if (!tileUrl) return;

    const name =
      typeof result.name === "string" && result.name.trim()
        ? result.name
        : completedJob.type.replace(/^gee\./, "").replaceAll(".", " ");

    const source = typeof result.source === "string" ? result.source : null;

    upsertResultLayer({
      id: `job:${completedJob.id}`,
      jobId: completedJob.id,
      name,
      analysisType: completedJob.type,
      tileUrl,
      visible: true,
      opacity: 0.82,
      createdAt: completedJob.completed_at || completedJob.updated_at,
      source,
    });
  }, [upsertResultLayer]);

  const refresh = useCallback(async (jobId?: string) => {
    const id = jobId || job?.id;
    if (!id) return null;

    const res = await apiFetch(`/geomoz-api/jobs/${id}`);
    if (!res.ok) {
      throw new Error(await parseError(res));
    }

    const data = (await res.json()) as AnalysisJob<T>;
    if (mounted.current) {
      setJob(data);
      registerCompletedLayer(data);
    }
    return data;
  }, [job?.id, registerCompletedLayer]);

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

  const adoptJob = useCallback((externalJob: AnalysisJob<T>) => {
    if (mounted.current) {
      setRequestError(null);
      setJob(externalJob);
      registerCompletedLayer(externalJob);
    }
    return externalJob;
  }, [registerCompletedLayer]);

  const cancel = useCallback(async () => {
    if (!job?.id || !ACTIVE_STATUSES.has(job.status)) return job;

    setRequestError(null);
    const res = await apiFetch(`/geomoz-api/jobs/${job.id}/cancel`, {
      method: "POST",
    });

    if (!res.ok) {
      const message = await parseError(res);
      setRequestError(message);
      throw new Error(message);
    }

    const cancelled = (await res.json()) as AnalysisJob<T>;
    if (mounted.current) setJob(cancelled);
    return cancelled;
  }, [job]);

  const retry = useCallback(async () => {
    if (!job?.id || ACTIVE_STATUSES.has(job.status)) return job;

    setRequestError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/geomoz-api/jobs/${job.id}/retry`, {
        method: "POST",
      });

      if (!res.ok) {
        const message = await parseError(res);
        setRequestError(message);
        throw new Error(message);
      }

      const retried = (await res.json()) as AnalysisJob<T>;
      if (mounted.current) setJob(retried);
      return retried;
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }, [job]);

  const resetJob = useCallback(() => {
    setJob(null);
    setRequestError(null);
  }, []);

  return {
    job,
    submitJob,
    refresh,
    adoptJob,
    cancel,
    retry,
    resetJob,
    running: submitting || (!!job && ACTIVE_STATUSES.has(job.status)),
    submitting,
    completed: job?.status === "completed",
    failed: job?.status === "failed",
    result: job?.result ?? null,
    error: job?.error?.message || requestError,
  };
}

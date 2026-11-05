/**
 * Client for GeoMoz asynchronous heavy GIS processing jobs.
 *
 * Uses the shared apiFetch helper, so Firebase auth and environment-specific
 * API base URL are inherited from the rest of the application.
 */

import { apiFetch } from "@/lib/api";

export type GISHeavyToolId = "hillshade" | "slope" | "aspect" | "cog";

export interface GISHeavyProcessingJob {
  id: string;
  tool: GISHeavyToolId;
  status: "queued" | "running" | "completed" | "failed";
  created_at: number;
  updated_at: number;
  input_name: string;
  output_name?: string | null;
  progress: number;
  message: string;
  parameters: Record<string, unknown>;
  error?: string | null;
}

export interface GISHeavyJobCreateResult {
  job: GISHeavyProcessingJob;
  status_url: string;
  result_url: string;
}

export interface GISHeavyTool {
  id: GISHeavyToolId;
  name: string;
}

export async function listGISHeavyTools(
  signal?: AbortSignal
): Promise<GISHeavyTool[]> {
  const response = await apiFetch("/geomoz-api/processing/tools", { signal });
  if (!response.ok) {
    throw new Error(
      "Não foi possível obter as ferramentas backend (HTTP " +
        response.status +
        ")."
    );
  }
  const data = (await response.json()) as { tools?: GISHeavyTool[] };
  return Array.isArray(data.tools) ? data.tools : [];
}

export async function createGISHeavyJob(options: {
  tool: GISHeavyToolId;
  file: File;
  parameters?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<GISHeavyJobCreateResult> {
  const body = new FormData();
  body.set("tool", options.tool);
  body.set("parameters", JSON.stringify(options.parameters ?? {}));
  body.set("input_file", options.file, options.file.name);

  const response = await apiFetch("/geomoz-api/processing/jobs", {
    method: "POST",
    body,
    signal: options.signal,
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((value) => value?.detail)
      .catch(() => null);
    throw new Error(
      detail || "Não foi possível criar o job (HTTP " + response.status + ")."
    );
  }
  return (await response.json()) as GISHeavyJobCreateResult;
}

export async function getGISHeavyJob(
  jobId: string,
  signal?: AbortSignal
): Promise<GISHeavyProcessingJob> {
  const response = await apiFetch(
    "/geomoz-api/processing/jobs/" + encodeURIComponent(jobId),
    { signal }
  );
  if (!response.ok) {
    const detail = await response
      .json()
      .then((value) => value?.detail)
      .catch(() => null);
    throw new Error(
      detail ||
        "Não foi possível consultar o job (HTTP " + response.status + ")."
    );
  }
  const data = (await response.json()) as { job: GISHeavyProcessingJob };
  return data.job;
}

export async function waitForGISHeavyJob(options: {
  jobId: string;
  signal?: AbortSignal;
  pollMs?: number;
  onProgress?: (job: GISHeavyProcessingJob) => void;
}): Promise<GISHeavyProcessingJob> {
  const pollMs = Math.max(400, options.pollMs ?? 1200);

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException("Operação cancelada.", "AbortError");
    }

    const job = await getGISHeavyJob(options.jobId, options.signal);
    options.onProgress?.(job);

    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.error || job.message || "O job backend falhou.");
    }

    await new Promise<void>((resolve, reject) => {
      const signal = options.signal;
      if (signal?.aborted) {
        reject(new DOMException("Operação cancelada.", "AbortError"));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(new DOMException("Operação cancelada.", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, pollMs);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

export async function downloadGISHeavyJobResult(
  jobId: string,
  signal?: AbortSignal
): Promise<File> {
  const response = await apiFetch(
    "/geomoz-api/processing/jobs/" + encodeURIComponent(jobId) + "/result",
    { signal }
  );
  if (!response.ok) {
    const detail = await response
      .json()
      .then((value) => value?.detail)
      .catch(() => null);
    throw new Error(
      detail ||
        "Não foi possível descarregar o resultado (HTTP " +
          response.status +
          ")."
    );
  }
  const buffer = await response.arrayBuffer();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] || "geomoz-job-" + jobId + ".tif";
  return new File([buffer], fileName, {
    type: response.headers.get("content-type") || "image/tiff",
  });
}

export async function deleteGISHeavyJob(
  jobId: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await apiFetch(
    "/geomoz-api/processing/jobs/" + encodeURIComponent(jobId),
    {
      method: "DELETE",
      signal,
    }
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(
      "Não foi possível limpar o job backend (HTTP " + response.status + ")."
    );
  }
}

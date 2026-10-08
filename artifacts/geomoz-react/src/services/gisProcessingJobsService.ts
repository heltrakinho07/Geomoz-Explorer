import type { FeatureCollection } from "geojson";
import { apiFetch } from "@/lib/api";

export type GISCloudJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "stale";

export type GISCloudJobSource =
  | {
      kind: "geojson";
      geojson: FeatureCollection;
      name?: string;
    }
  | {
      kind: "url";
      url: string;
      name?: string;
    }
  | {
      kind: "storage";
      storage_path: string;
      name?: string;
    };

export interface GISCloudToolParameter {
  type: "number" | "select" | "boolean" | "text";
  default?: unknown;
  min?: number;
  max?: number;
  required?: boolean;
  options?: string[];
}

export interface GISCloudTool {
  id:
    | "vector_buffer"
    | "vector_dissolve"
    | "vector_intersection"
    | "raster_slope"
    | "raster_aspect"
    | "raster_hillshade";
  name: string;
  kind: "vector" | "raster";
  inputs: number;
  output: "vector" | "raster";
  parameters: Record<string, GISCloudToolParameter>;
}

export interface GISCloudJobResult {
  kind: "vector" | "raster";
  storage_path?: string | null;
  content_type: string;
  file_name: string;
  size_bytes: number;
}

export interface GISCloudJob {
  id: string;
  uid?: string;
  project_id: string;
  tool: GISCloudTool["id"];
  status: GISCloudJobStatus;
  progress: number;
  message?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  heartbeat_at?: string | null;
  cancel_requested?: boolean;
  parameters: Record<string, unknown>;
  input_name?: string | null;
  secondary_input_name?: string | null;
  result?: GISCloudJobResult | null;
  output_count?: number;
  error?: string | null;
}

export interface CreateGISCloudJobInput {
  project_id: string;
  tool: GISCloudTool["id"];
  input: GISCloudJobSource;
  secondary_input?: GISCloudJobSource;
  parameters?: Record<string, unknown>;
}

async function jsonOrError<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      data && typeof data.detail === "string"
        ? data.detail
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data as T;
}

export async function listGISCloudTools(): Promise<GISCloudTool[]> {
  const response = await apiFetch("/geomoz-api/gis/tools");
  const data = await jsonOrError<{ tools: GISCloudTool[] }>(response);
  return data.tools;
}

export async function createGISCloudJob(
  input: CreateGISCloudJobInput
): Promise<GISCloudJob> {
  const response = await apiFetch("/geomoz-api/gis/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      parameters: input.parameters ?? {},
    }),
  });
  return jsonOrError<GISCloudJob>(response);
}

export async function listGISCloudJobs(
  projectId: string,
  limit = 25
): Promise<GISCloudJob[]> {
  const params = new URLSearchParams({
    project_id: projectId,
    limit: String(limit),
  });
  const response = await apiFetch(`/geomoz-api/gis/jobs?${params}`);
  const data = await jsonOrError<{ jobs: GISCloudJob[] }>(response);
  return data.jobs;
}

export async function getGISCloudJob(
  projectId: string,
  jobId: string
): Promise<GISCloudJob> {
  const params = new URLSearchParams({ project_id: projectId });
  const response = await apiFetch(
    `/geomoz-api/gis/jobs/${encodeURIComponent(jobId)}?${params}`
  );
  return jsonOrError<GISCloudJob>(response);
}

export async function cancelGISCloudJob(
  projectId: string,
  jobId: string
): Promise<GISCloudJob> {
  const params = new URLSearchParams({ project_id: projectId });
  const response = await apiFetch(
    `/geomoz-api/gis/jobs/${encodeURIComponent(jobId)}?${params}`,
    { method: "DELETE" }
  );
  return jsonOrError<GISCloudJob>(response);
}

export async function downloadGISCloudJobResult(
  projectId: string,
  jobId: string
): Promise<{
  blob: Blob;
  contentType: string;
  fileName: string;
}> {
  const params = new URLSearchParams({ project_id: projectId });
  const response = await apiFetch(
    `/geomoz-api/gis/jobs/${encodeURIComponent(jobId)}/result?${params}`
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data && typeof data.detail === "string"
        ? data.detail
        : `HTTP ${response.status}`
    );
  }

  const contentType =
    response.headers.get("Content-Type") || "application/octet-stream";
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] || "gis-result.bin";
  return {
    blob: await response.blob(),
    contentType,
    fileName,
  };
}

export function isGISCloudJobActive(job: GISCloudJob): boolean {
  return job.status === "queued" || job.status === "running";
}

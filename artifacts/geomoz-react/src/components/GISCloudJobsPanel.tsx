import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import {
  AlertCircle,
  CheckCircle2,
  CloudCog,
  Download,
  Play,
  RefreshCw,
  Square,
  XCircle,
} from "lucide-react";
import {
  cancelGISCloudJob,
  createGISCloudJob,
  downloadGISCloudJobResult,
  isGISCloudJobActive,
  listGISCloudJobs,
  listGISCloudTools,
  type GISCloudJob,
  type GISCloudJobSource,
  type GISCloudTool,
} from "@/services/gisProcessingJobsService";
import {
  ensureGISRasterProcessingSource,
  ensureGISVectorProcessingStorage,
} from "@/services/gisWorkspaceCloudService";
import type { GISWorkspaceRasterLayer } from "@/lib/gis-raster";

interface VectorLayerOption {
  id: string;
  name: string;
  geojson: FeatureCollection;
  featureCount: number;
  geometryType: string;
  fields: string[];
  color: string;
  visible: boolean;
  isResult?: boolean;
}

interface Props {
  uid: string | null;
  projectId: string;
  vectorLayers: VectorLayerOption[];
  rasterLayers: GISWorkspaceRasterLayer[];
  onAddVector: (name: string, geojson: FeatureCollection) => void;
  onAddRaster: (name: string, file: File) => void;
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return "—";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: GISCloudJob["status"]): string {
  return {
    queued: "Na fila",
    running: "A executar",
    succeeded: "Concluído",
    failed: "Falhou",
    cancelled: "Cancelado",
    stale: "Interrompido",
  }[status];
}

export default function GISCloudJobsPanel({
  uid,
  projectId,
  vectorLayers,
  rasterLayers,
  onAddVector,
  onAddRaster,
}: Props) {
  const [tools, setTools] = useState<GISCloudTool[]>([]);
  const [jobs, setJobs] = useState<GISCloudJob[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string>("");
  const [inputId, setInputId] = useState("");
  const [secondaryInputId, setSecondaryInputId] = useState("");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [materializingId, setMaterializingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId) ?? null,
    [selectedToolId, tools]
  );

  const layerOptions =
    selectedTool?.kind === "raster" ? rasterLayers : vectorLayers;

  const loadJobs = useCallback(async () => {
    if (!uid || !projectId || projectId === "session-default") return;
    setJobsLoading(true);
    try {
      setJobs(await listGISCloudJobs(projectId, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJobsLoading(false);
    }
  }, [projectId, uid]);

  useEffect(() => {
    if (!uid || !projectId || projectId === "session-default") return;
    let cancelled = false;
    void (async () => {
      try {
        const [catalog, recent] = await Promise.all([
          listGISCloudTools(),
          listGISCloudJobs(projectId, 30),
        ]);
        if (cancelled) return;
        setTools(catalog);
        setJobs(recent);
        const first = catalog[0];
        if (first) {
          setSelectedToolId((current) => current || first.id);
          setParameters(
            Object.fromEntries(
              Object.entries(first.parameters).flatMap(([name, parameter]) =>
                parameter.default === undefined
                  ? []
                  : [[name, parameter.default]]
              )
            )
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, uid]);

  useEffect(() => {
    if (!jobs.some(isGISCloudJobActive)) return;
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  useEffect(() => {
    if (!selectedTool) return;
    setInputId("");
    setSecondaryInputId("");
    setParameters(
      Object.fromEntries(
        Object.entries(selectedTool.parameters).flatMap(([name, parameter]) =>
          parameter.default === undefined ? [] : [[name, parameter.default]]
        )
      )
    );
  }, [selectedToolId]);

  const vectorSource = useCallback(
    async (layerId: string): Promise<GISCloudJobSource> => {
      const layer = vectorLayers.find((candidate) => candidate.id === layerId);
      if (!layer) throw new Error("Camada vetorial não encontrada.");

      const json = JSON.stringify(layer.geojson);
      if (new Blob([json]).size <= 10 * 1024 * 1024) {
        return {
          kind: "geojson",
          geojson: layer.geojson,
          name: `${layer.name}.geojson`,
        };
      }
      if (!uid) throw new Error("Autenticação necessária para dados vetoriais grandes.");
      const path = await ensureGISVectorProcessingStorage(uid, projectId, layer);
      return {
        kind: "storage",
        storage_path: path,
        name: `${layer.name}.geojson`,
      };
    },
    [projectId, uid, vectorLayers]
  );

  const rasterSource = useCallback(
    async (layerId: string): Promise<GISCloudJobSource> => {
      const layer = rasterLayers.find((candidate) => candidate.id === layerId);
      if (!layer) throw new Error("Camada raster não encontrada.");
      if (!uid) throw new Error("Autenticação necessária para processamento raster cloud.");
      return ensureGISRasterProcessingSource(uid, projectId, layer);
    },
    [projectId, rasterLayers, uid]
  );

  const submit = useCallback(async () => {
    if (!uid) {
      setError("Inicie sessão para usar o processamento GIS no Cloud Run.");
      return;
    }
    if (!selectedTool || !inputId) {
      setError("Selecione a ferramenta e a camada de entrada.");
      return;
    }
    if (selectedTool.inputs > 1 && !secondaryInputId) {
      setError("Esta ferramenta requer uma segunda camada.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const source =
        selectedTool.kind === "raster"
          ? await rasterSource(inputId)
          : await vectorSource(inputId);
      const secondary =
        selectedTool.inputs > 1
          ? await vectorSource(secondaryInputId)
          : undefined;

      const created = await createGISCloudJob({
        project_id: projectId,
        tool: selectedTool.id,
        input: source,
        secondary_input: secondary,
        parameters,
      });
      setJobs((previous) => [created, ...previous.filter((job) => job.id !== created.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [
    inputId,
    parameters,
    projectId,
    rasterSource,
    secondaryInputId,
    selectedTool,
    uid,
    vectorSource,
  ]);

  const materialize = useCallback(
    async (job: GISCloudJob) => {
      setMaterializingId(job.id);
      setError(null);
      try {
        const downloaded = await downloadGISCloudJobResult(projectId, job.id);
        if (job.result?.kind === "vector") {
          const parsed = JSON.parse(await downloaded.blob.text()) as FeatureCollection;
          if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
            throw new Error("O job devolveu GeoJSON inválido.");
          }
          onAddVector(`Cloud · ${job.tool}`, parsed);
        } else {
          const file = new File([downloaded.blob], downloaded.fileName, {
            type: downloaded.contentType || "image/tiff",
          });
          onAddRaster(`Cloud · ${job.tool}`, file);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setMaterializingId(null);
      }
    },
    [onAddRaster, onAddVector, projectId]
  );

  if (!uid || projectId === "session-default") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        <CloudCog size={18} className="mb-2" />
        O processamento pesado exige sessão autenticada e um projeto GeoMoz ativo,
        porque jobs e resultados são isolados por utilizador/projeto no Firestore
        e Firebase Storage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-2.5 text-[11px] text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
        <span className="mb-0.5 block font-semibold">
          Cloud GIS · GDAL + GeoPandas
        </span>
        Use para rasters grandes ou operações que não devem depender da RAM/CPU
        do browser. O resultado regressa ao mesmo layer store do GIS Workspace.
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[10px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle size={13} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">
        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Ferramenta do servidor
        </label>
        <select
          value={selectedToolId}
          onChange={(event) => setSelectedToolId(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900"
        >
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name} · {tool.kind}
            </option>
          ))}
        </select>

        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Entrada
        </label>
        <select
          value={inputId}
          onChange={(event) => setInputId(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Selecionar camada…</option>
          {layerOptions.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>

        {selectedTool && selectedTool.inputs > 1 && (
          <>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Segunda entrada
            </label>
            <select
              value={secondaryInputId}
              onChange={(event) => setSecondaryInputId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Selecionar camada…</option>
              {vectorLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
          </>
        )}

        {selectedTool &&
          Object.entries(selectedTool.parameters).map(([name, parameter]) => {
            const value = parameters[name] ?? parameter.default ?? "";
            return (
              <label key={name} className="block space-y-1">
                <span className="text-[9px] font-semibold text-slate-500">
                  {name}
                </span>
                {parameter.type === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) =>
                      setParameters((previous) => ({
                        ...previous,
                        [name]: event.target.checked,
                      }))
                    }
                  />
                ) : parameter.type === "select" ? (
                  <select
                    value={String(value)}
                    onChange={(event) =>
                      setParameters((previous) => ({
                        ...previous,
                        [name]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                  >
                    {(parameter.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={parameter.type === "number" ? "number" : "text"}
                    value={String(value)}
                    min={parameter.min}
                    max={parameter.max}
                    onChange={(event) =>
                      setParameters((previous) => ({
                        ...previous,
                        [name]:
                          parameter.type === "number"
                            ? event.target.value === ""
                              ? ""
                              : Number(event.target.value)
                            : event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900"
                  />
                )}
              </label>
            );
          })}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading || !selectedTool || !inputId}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          {loading ? "A submeter…" : "Executar no Cloud Run"}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Jobs recentes
          </span>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <RefreshCw size={10} className={jobsLoading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-400 dark:border-slate-700">
            Nenhum job neste projeto.
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    {job.tool}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {statusLabel(job.status)} · {job.progress ?? 0}%
                    {job.result?.size_bytes
                      ? ` · ${formatBytes(job.result.size_bytes)}`
                      : ""}
                  </div>
                </div>
                {job.status === "succeeded" ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : job.status === "failed" || job.status === "stale" ? (
                  <XCircle size={14} className="text-rose-500" />
                ) : isGISCloudJobActive(job) ? (
                  <RefreshCw size={14} className="animate-spin text-sky-500" />
                ) : (
                  <Square size={14} className="text-slate-400" />
                )}
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, job.progress ?? 0))}%` }}
                />
              </div>

              {(job.message || job.error) && (
                <div
                  className={`mt-1.5 text-[9px] ${
                    job.error ? "text-rose-600" : "text-slate-500"
                  }`}
                >
                  {job.error || job.message}
                </div>
              )}

              <div className="mt-2 flex gap-1.5">
                {isGISCloudJobActive(job) && (
                  <button
                    type="button"
                    onClick={() =>
                      void cancelGISCloudJob(projectId, job.id).then(loadJobs)
                    }
                    className="flex-1 rounded-md border border-rose-200 px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900"
                  >
                    Cancelar
                  </button>
                )}
                {job.status === "succeeded" && (
                  <button
                    type="button"
                    onClick={() => void materialize(job)}
                    disabled={materializingId === job.id}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[9px] font-bold text-white disabled:opacity-50"
                  >
                    {materializingId === job.id ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      <Download size={10} />
                    )}
                    Adicionar ao mapa
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

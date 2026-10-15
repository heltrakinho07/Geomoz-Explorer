import type { FeatureCollection } from "geojson";
import type { GISVectorParameters, GISVectorResult } from "./gis-vector-engine";

export interface GISVectorJobOptions {
  /** Cancels the running worker immediately, without publishing a partial result. */
  signal?: AbortSignal;
  /** State transitions, not fabricated percentage-based progress. */
  onStateChange?: (state: "running" | "finished") => void;
  timeoutMs?: number;
}

/** One browser worker per command. Cancelling/timeout frees CPU and prevents stale output. */
export function runGISVectorCommand(
  tool: string,
  input: FeatureCollection,
  parameters: GISVectorParameters = {},
  overlay?: FeatureCollection,
  options: GISVectorJobOptions = {},
): Promise<GISVectorResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("Análise GIS cancelada."));
      return;
    }
    if (typeof Worker === "undefined") {
      reject(new Error("Este navegador não suporta Web Workers."));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./gis-vector.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      reject(new Error("Falha ao iniciar o Web Worker GIS: " + String(err)));
      return;
    }
    const id = crypto.randomUUID();
    let finished = false;
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1000, Math.min(options.timeoutMs!, 300000))
      : 60000;
    const finish = (error?: Error, response?: GISVectorResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      options.onStateChange?.("finished");
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(new Error("O motor GIS não devolveu um resultado válido."));
    };
    const onAbort = () => finish(new Error("Análise GIS cancelada."));
    const timer = setTimeout(
      () => finish(new Error("A análise excedeu o limite de tempo; reduza a AOI ou divida a camada.")),
      timeoutMs,
    );
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{
      id: string; status: "success" | "error"; response?: GISVectorResult; error?: string;
    }>) => {
      if (event.data?.id !== id) return;
      if (event.data.status === "success" && event.data.response) {
        finish(undefined, event.data.response);
      } else {
        finish(new Error(event.data.error || "O motor vectorial falhou."));
      }
    };
    worker.onerror = () => finish(new Error("Erro de execução no Web Worker GIS."));
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    try {
      options.onStateChange?.("running");
      worker.postMessage({ id, tool, input, parameters, overlay });
    } catch (err) {
      finish(new Error("Falha ao enviar dados geográficos ao worker: " + String(err)));
    }
  });
}

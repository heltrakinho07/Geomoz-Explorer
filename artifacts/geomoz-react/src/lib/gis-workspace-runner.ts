import type { FeatureCollection } from "geojson";
import type { WorkspaceExecution, WorkspaceOperationId, WorkspaceParameters } from "./gis-workspace-engine";

/**
 * Each command runs in its own isolated worker. Hard timeout and termination
 * avoid freezing the workspace when a geometry operation is expensive.
 */
export function runWorkspaceOperationAsync(
  command: WorkspaceOperationId,
  input: FeatureCollection,
  overlay?: FeatureCollection,
  parameters: WorkspaceParameters = {},
): Promise<WorkspaceExecution> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("Este navegador não suporta processamento GIS em Web Workers."));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./gis-workspace.worker.ts", import.meta.url), { type: "module" });
    } catch (cause) {
      reject(new Error(`Não foi possível iniciar o motor GIS: ${String(cause)}`));
      return;
    }
    const id = crypto.randomUUID();
    let done = false;
    const finish = (error?: Error, result?: WorkspaceExecution) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error("O motor GIS não devolveu resultados."));
    };
    const timeout = setTimeout(() => finish(new Error("Tempo limite (60 segundos) excedido. Reduza a AOI ou o número de feições.")), 60000);
    worker.onmessage = (event: MessageEvent<{
      id: string; status: "success" | "error"; result?: WorkspaceExecution; error?: string;
    }>) => {
      if (event.data?.id !== id) return;
      if (event.data.status === "success" && event.data.result) finish(undefined, event.data.result);
      else finish(new Error(event.data.error || "Operação GIS falhou."));
    };
    worker.onerror = () => finish(new Error("Falha no Web Worker durante a operação GIS."));
    try {
      worker.postMessage({ id, command, input, overlay, parameters });
    } catch (cause) {
      finish(new Error(`Não foi possível enviar os dados ao motor GIS: ${String(cause)}`));
    }
  });
}

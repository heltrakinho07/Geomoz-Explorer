import type { FeatureCollection } from "geojson";
import type { GISVectorParameters, GISVectorResult } from "./gis-vector-engine";

/** Worker per command: main thread remains responsive; timeout stops pathological geometry jobs. */
export function runGISVectorCommand(
  tool: string, input: FeatureCollection,
  parameters: GISVectorParameters = {}, overlay?: FeatureCollection,
): Promise<GISVectorResult> {
  return new Promise((resolve, reject) => {
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
    const finish = (error?: Error, response?: GISVectorResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(new Error("O motor GIS não devolveu um resultado válido."));
    };
    const timer = setTimeout(
      () => finish(new Error("A análise excedeu 60 segundos; reduza a AOI ou divida a camada.")),
      60000,
    );
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
    try {
      worker.postMessage({ id, tool, input, parameters, overlay });
    } catch (err) {
      finish(new Error("Falha ao enviar dados geográficos ao worker: " + String(err)));
    }
  });
}

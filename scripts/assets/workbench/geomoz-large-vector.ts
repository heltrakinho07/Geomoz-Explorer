/**
 * Host bridge: convert a large local GeoJSON to GeoParquet without blocking the
 * main thread. Abort terminates the dedicated worker and its DuckDB activity.
 */
export interface GeoMozLargeVectorOptions {
  signal: AbortSignal;
  onProgress: (label: string, percent?: number) => void;
}
type WorkerMessage =
  | { kind: "progress"; label: string; percent?: number }
  | { kind: "complete"; buffer: ArrayBuffer }
  | { kind: "error"; message: string };

function abortError(): Error {
  const error = new Error("Importação cancelada pelo utilizador.");
  error.name = "AbortError";
  return error;
}

export function prepareGeoMozLargeGeoJSONFile(
  source: File,
  options: GeoMozLargeVectorOptions,
): Promise<File> {
  if (options.signal.aborted) return Promise.reject(abortError());

  return new Promise<File>((resolve, reject) => {
    const worker = new Worker(new URL("./geomoz-large-vector.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const finish = (error: Error | null, output?: File) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error);
      else if (output) resolve(output);
      else reject(new Error("Conversão terminada sem ficheiro de saída."));
    };
    const onAbort = () => finish(abortError());
    options.signal.addEventListener("abort", onAbort, { once: true });

    worker.onerror = (event) => {
      event.preventDefault();
      finish(new Error(event.message || "Falha ao iniciar o motor DuckDB-WASM."));
    };
    worker.onmessageerror = () =>
      finish(new Error("Não foi possível receber o resultado do processamento."));
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (settled) return;
      if (message?.kind === "progress") {
        options.onProgress(message.label, message.percent);
      } else if (message?.kind === "error") {
        finish(new Error(message.message));
      } else if (message?.kind === "complete") {
        const name = source.name.replace(/\.(?:geojson|json)$/i, "") + ".parquet";
        finish(null, new File([message.buffer], name, {
          type: "application/vnd.apache.parquet",
        }));
      }
    };
    if (options.signal.aborted) {
      onAbort();
      return;
    }
    try {
      options.onProgress("A iniciar o processamento em segundo plano");
      worker.postMessage({ kind: "convert", file: source });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Não foi possível iniciar o worker."));
    }
  });
}

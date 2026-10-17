import { MAX_DEM_BYTES, type TerrainOptions, type TerrainProgress, type TerrainResult } from "./terrain-workflow";
import type { TerrainWorkerMessage } from "../workers/terrain-workflow.worker";

export async function readBoundedDem(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`Não foi possível obter o DEM (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length")) > MAX_DEM_BYTES)
    throw new Error("O DEM excede 64 MiB. Reduza a área de análise.");
  if (!response.body) throw new Error("A fonte não devolveu dados raster.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DEM_BYTES) throw new Error("O DEM excede 64 MiB. Reduza a área de análise.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function runTerrainWorkflow(bytes: Uint8Array, name: string, options: TerrainOptions,
  signal: AbortSignal, onProgress: (event: TerrainProgress) => void): Promise<TerrainResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/terrain-workflow.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Análise cancelada.", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("A análise excedeu 5 minutos. Use uma área menor ou uma grelha mais grossa.")); }, 300_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<TerrainWorkerMessage>) => {
      if (event.data.kind === "progress") { onProgress(event.data.progress); return; }
      cleanup();
      if (event.data.kind === "error") reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Falha ao carregar o motor de análise.")); };
    worker.onmessageerror = () => { cleanup(); reject(new Error("Resposta inválida do motor de análise.")); };
    try { worker.postMessage({ bytes, name, options }); } catch (error) { cleanup(); reject(error); }
  });
}

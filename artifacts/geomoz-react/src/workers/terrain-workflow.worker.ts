/// <reference lib="webworker" />
import { executeTerrainWorkflow, type TerrainOptions, type TerrainResult, type TerrainProgress } from "../lib/terrain-workflow";
export type TerrainWorkerMessage =
  | { kind: "progress"; progress: TerrainProgress }
  | { kind: "result"; result: TerrainResult }
  | { kind: "error"; error: string };
self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array; name: string; options: TerrainOptions }>) => {
  try {
    const { bytes, name, options } = event.data;
    const result = await executeTerrainWorkflow(bytes, name, options, progress => {
      self.postMessage({ kind: "progress", progress } satisfies TerrainWorkerMessage);
    });
    self.postMessage({ kind: "result", result } satisfies TerrainWorkerMessage);
  } catch (error) {
    self.postMessage({ kind: "error", error: error instanceof Error ? error.message : String(error) } satisfies TerrainWorkerMessage);
  }
};

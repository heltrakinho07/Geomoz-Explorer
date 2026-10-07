/// <reference lib="webworker" />
import { runTool } from "whitebox-wasm/tools";

export interface GeoMozWhiteboxWorkerRequest {
  tool: string;
  args: string[];
  input: Record<string, Uint8Array>;
}

export type GeoMozWhiteboxWorkerResponse =
  | { kind: "ready" }
  | {
      kind: "result";
      exitCode: number;
      stdout: string[];
      files: Record<string, Uint8Array>;
    }
  | { kind: "error"; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener(
  "message",
  async (event: MessageEvent<GeoMozWhiteboxWorkerRequest>) => {
    const request = event.data;
    scope.postMessage({ kind: "ready" } satisfies GeoMozWhiteboxWorkerResponse);
    try {
      const result = await runTool(request.tool, {
        args: request.args,
        input: request.input,
      });
      scope.postMessage({
        kind: "result",
        exitCode: result.exitCode,
        stdout: result.stdout,
        files: result.files,
      } satisfies GeoMozWhiteboxWorkerResponse);
    } catch (error) {
      scope.postMessage({
        kind: "error",
        error: error instanceof Error ? error.message : String(error),
      } satisfies GeoMozWhiteboxWorkerResponse);
    }
  }
);

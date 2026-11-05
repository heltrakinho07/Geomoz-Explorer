declare module "whitebox-wasm/tools" {
  export interface WhiteboxToolRunOptions {
    args?: string[];
    input?: Record<string, Uint8Array>;
  }

  export interface WhiteboxToolRunResult {
    exitCode: number;
    stdout: string[];
    files: Record<string, Uint8Array>;
  }

  export function initTools(
    source?: URL | Response | Uint8Array | ArrayBuffer | string
  ): Promise<WebAssembly.Module>;

  export function listTools(): Promise<string[]>;

  export function runTool(
    tool: string,
    options?: WhiteboxToolRunOptions
  ): Promise<WhiteboxToolRunResult>;
}

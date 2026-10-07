/**
 * GeoMoz adapter for GeoLibre's published Whitebox/GeoLibre WebAssembly runtime.
 *
 * The runtime package is MIT-licensed and originates from:
 * https://github.com/opengeos/GeoLibre
 *
 * This adapter keeps GeoMoz's own layer/project model while using the real
 * geolibre-wasm tool manifests and WASI execution engine.
 */
import type { FeatureCollection } from "geojson";
import type {
  GeoMozWhiteboxWorkerRequest,
  GeoMozWhiteboxWorkerResponse,
} from "@/workers/whitebox-wasm.worker";

export interface WhiteboxWasmParameter {
  name: string;
  description?: string;
  required?: boolean;
  io_role?: string;
  data_kind?: string;
  schema?: {
    kind?: string;
    data_kind?: string;
    dataset?: { kind?: string };
    options?: Array<{ value?: unknown; label?: string }>;
    [key: string]: unknown;
  };
}

export interface WhiteboxWasmManifest {
  id: string;
  display_name?: string;
  summary?: string;
  category?: string;
  license_tier?: string;
  source?: string;
  defaults?: Record<string, unknown>;
  params?: WhiteboxWasmParameter[];
}

export interface WhiteboxVectorRunResult {
  outputs: Array<{
    parameter: string;
    geojson: FeatureCollection;
  }>;
  stdout: string[];
  executionTimeMs: number;
}

interface ToolsModule {
  listManifests: () => Promise<WhiteboxWasmManifest[]>;
}

let manifestsPromise: Promise<WhiteboxWasmManifest[]> | null = null;
let warmWorker: Worker | null = null;

export function whiteboxParamKind(parameter: WhiteboxWasmParameter): string {
  const schema = parameter.schema ?? {};
  const dataset =
    schema.dataset && typeof schema.dataset === "object" ? schema.dataset : {};
  const dataKind = String(
    parameter.data_kind ?? schema.data_kind ?? dataset.kind ?? ""
  ).toLowerCase();
  const role = String(parameter.io_role ?? schema.kind ?? "").toLowerCase();

  if (role === "input") {
    return ["vector", "raster", "lidar", "file"].includes(dataKind)
      ? `${dataKind}_in`
      : "file_in";
  }
  if (role === "output") {
    return ["vector", "raster", "lidar", "file"].includes(dataKind)
      ? `${dataKind}_out`
      : "file_out";
  }
  return dataKind || String(schema.kind ?? "").toLowerCase();
}

export function whiteboxManifestName(manifest: WhiteboxWasmManifest): string {
  return (
    manifest.display_name ||
    manifest.id
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function whiteboxManifestDefaults(
  manifest: WhiteboxWasmManifest
): Record<string, unknown> {
  const defaults = manifest.defaults ?? {};
  const result: Record<string, unknown> = {};
  for (const parameter of manifest.params ?? []) {
    const kind = whiteboxParamKind(parameter);
    if (kind.endsWith("_in") || kind.endsWith("_out")) continue;
    if (Object.prototype.hasOwnProperty.call(defaults, parameter.name)) {
      result[parameter.name] = defaults[parameter.name];
    }
  }
  return result;
}

export function whiteboxVectorSupport(manifest: WhiteboxWasmManifest): {
  supported: boolean;
  reason?: string;
  vectorInputs: WhiteboxWasmParameter[];
  vectorOutputs: WhiteboxWasmParameter[];
} {
  const parameters = manifest.params ?? [];
  const vectorInputs = parameters.filter(
    (parameter) => whiteboxParamKind(parameter) === "vector_in"
  );
  const vectorOutputs = parameters.filter(
    (parameter) => whiteboxParamKind(parameter) === "vector_out"
  );
  const unsupportedDataset = parameters.find((parameter) => {
    const kind = whiteboxParamKind(parameter);
    return (
      (kind.endsWith("_in") || kind.endsWith("_out")) &&
      kind !== "vector_in" &&
      kind !== "vector_out"
    );
  });

  if (unsupportedDataset) {
    return {
      supported: false,
      reason: `Requer ${whiteboxParamKind(unsupportedDataset).replace("_", " ")}. O runtime está instalado, mas o layer store raster/LiDAR entra na próxima etapa.`,
      vectorInputs,
      vectorOutputs,
    };
  }
  if (!vectorInputs.length) {
    return {
      supported: false,
      reason: "Esta ferramenta não declara uma entrada vetorial utilizável no workspace atual.",
      vectorInputs,
      vectorOutputs,
    };
  }
  if (!vectorOutputs.length) {
    return {
      supported: false,
      reason: "Esta ferramenta não declara uma saída vetorial para adicionar ao mapa.",
      vectorInputs,
      vectorOutputs,
    };
  }
  if (vectorInputs.length > 2) {
    return {
      supported: false,
      reason: "Esta ferramenta requer mais de duas entradas vetoriais; o seletor multi-input ainda será ligado.",
      vectorInputs,
      vectorOutputs,
    };
  }

  return { supported: true, vectorInputs, vectorOutputs };
}

export async function listWhiteboxWasmManifests(): Promise<WhiteboxWasmManifest[]> {
  if (!manifestsPromise) {
    manifestsPromise = (async () => {
      const tools = (await import("geolibre-wasm/tools")) as unknown as ToolsModule;
      const manifests = await tools.listManifests();
      return manifests
        .filter((manifest) => manifest?.id)
        .sort((a, b) => whiteboxManifestName(a).localeCompare(whiteboxManifestName(b)));
    })().catch((error) => {
      manifestsPromise = null;
      throw error;
    });
  }
  return manifestsPromise;
}

function acquireWorker(): Worker {
  if (!warmWorker) {
    warmWorker = new Worker(
      new URL("../workers/whitebox-wasm.worker.ts", import.meta.url),
      { type: "module" }
    );
  }
  return warmWorker;
}

function runWorker(request: GeoMozWhiteboxWorkerRequest): Promise<{
  exitCode: number;
  stdout: string[];
  files: Record<string, Uint8Array>;
}> {
  const worker = acquireWorker();

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<GeoMozWhiteboxWorkerResponse>) => {
      if (event.data.kind === "ready") return;
      cleanup();
      if (event.data.kind === "error") {
        reject(new Error(event.data.error));
        return;
      }
      resolve({
        exitCode: event.data.exitCode,
        stdout: event.data.stdout,
        files: event.data.files,
      });
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      warmWorker?.terminate();
      warmWorker = null;
      reject(new Error(event.message || "O worker Whitebox WASM falhou."));
    };

    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(request);
  });
}

function scalarValue(
  manifest: WhiteboxWasmManifest,
  parameter: WhiteboxWasmParameter,
  supplied: Record<string, unknown>
): unknown {
  if (Object.prototype.hasOwnProperty.call(supplied, parameter.name)) {
    return supplied[parameter.name];
  }
  return manifest.defaults?.[parameter.name];
}

function outputFileName(toolId: string, parameterName: string): string {
  const safe = `${toolId}_${parameterName}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${safe}.geojson`;
}

export async function runWhiteboxVectorTool(params: {
  manifest: WhiteboxWasmManifest;
  primaryLayer: FeatureCollection;
  secondaryLayer?: FeatureCollection;
  parameters?: Record<string, unknown>;
}): Promise<WhiteboxVectorRunResult> {
  const started = performance.now();
  const support = whiteboxVectorSupport(params.manifest);
  if (!support.supported) {
    throw new Error(support.reason || "Ferramenta não suportada pelo layer store atual.");
  }

  const encoder = new TextEncoder();
  const input: Record<string, Uint8Array> = {};
  const args: string[] = [];
  const outputFiles = new Map<string, string>();

  support.vectorInputs.forEach((parameter, index) => {
    const layer = index === 0 ? params.primaryLayer : params.secondaryLayer;
    if (!layer) {
      throw new Error(
        `A ferramenta requer uma ${index === 0 ? "camada principal" : "segunda camada"} para "${parameter.name}".`
      );
    }
    const file = `${parameter.name}_${index + 1}.geojson`;
    input[file] = encoder.encode(JSON.stringify(layer));
    args.push(`--${parameter.name}=/work/${file}`);
  });

  for (const parameter of params.manifest.params ?? []) {
    const kind = whiteboxParamKind(parameter);
    if (kind === "vector_in") continue;

    if (kind === "vector_out") {
      const file = outputFileName(params.manifest.id, parameter.name);
      outputFiles.set(parameter.name, file);
      args.push(`--${parameter.name}=/work/${file}`);
      continue;
    }

    if (kind.endsWith("_in") || kind.endsWith("_out")) continue;

    const value = scalarValue(
      params.manifest,
      parameter,
      params.parameters ?? {}
    );
    if (value === undefined || value === null || value === "") {
      if (parameter.required) {
        throw new Error(`O parâmetro obrigatório "${parameter.name}" está vazio.`);
      }
      continue;
    }
    args.push(`--${parameter.name}=${String(value)}`);
  }

  const result = await runWorker({
    tool: params.manifest.id,
    args,
    input,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stdout.join("\n").trim() ||
        `Whitebox terminou com código ${result.exitCode}.`
    );
  }

  const outputs: WhiteboxVectorRunResult["outputs"] = [];
  const decoder = new TextDecoder();

  for (const [parameter, file] of outputFiles.entries()) {
    const bytes = result.files[file];
    if (!bytes) continue;
    try {
      const parsed = JSON.parse(decoder.decode(bytes));
      if (
        parsed?.type === "FeatureCollection" &&
        Array.isArray(parsed.features)
      ) {
        outputs.push({ parameter, geojson: parsed as FeatureCollection });
      }
    } catch {
      // Ignore malformed partial output while preserving other valid outputs.
    }
  }

  if (!outputs.length) {
    throw new Error(
      "A ferramenta terminou, mas não produziu uma saída GeoJSON vetorial legível."
    );
  }

  return {
    outputs,
    stdout: result.stdout,
    executionTimeMs: Math.round(performance.now() - started),
  };
}

/**
 * GeoMoz large-GeoJSON ingestion worker.
 * The source is read once, and DuckDB-WASM's own worker performs the Spatial
 * conversion. No JSON.parse/GeoJSON materialization on the map UI thread.
 */
import { convertDuckDbVectorToGeoParquet } from "./duckdb-vector-loader";

interface ConvertRequest {
  kind: "convert";
  file: File;
}
interface ConvertResponse {
  kind: "progress" | "complete" | "error";
  label?: string;
  percent?: number;
  buffer?: ArrayBuffer;
  message?: string;
}
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ConvertRequest>) => void) | null;
  postMessage: (value: ConvertResponse, transfer?: Transferable[]) => void;
};

function readWithProgress(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        scope.postMessage({
          kind: "progress",
          label: "A ler o ficheiro geológico",
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o GeoJSON."));
    reader.onabort = () => reject(new Error("Leitura interrompida."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("O navegador não conseguiu ler o ficheiro binário."));
    };
    reader.readAsArrayBuffer(file);
  });
}

scope.onmessage = (event) => {
  if (event.data?.kind !== "convert") return;
  void (async () => {
    const file = event.data.file;
    if (!file || !/\.(?:geojson|json)$/i.test(file.name)) {
      throw new Error("Formato inválido para a conversão GeoJSON.");
    }
    const bytes = await readWithProgress(file);
    scope.postMessage({
      kind: "progress",
      label: "A converter para GeoParquet com DuckDB-WASM Spatial",
    });
    const converted = await convertDuckDbVectorToGeoParquet({
      name: file.name,
      extension: file.name.toLowerCase().endsWith(".geojson") ? "geojson" : "json",
      data: new Uint8Array(bytes),
    });
    if (converted.data.byteLength === 0) {
      throw new Error("O motor espacial produziu um GeoParquet vazio.");
    }
    const output = new Uint8Array(converted.data.byteLength);
    output.set(converted.data);
    scope.postMessage({ kind: "complete", buffer: output.buffer }, [output.buffer]);
  })().catch((error: unknown) => {
    scope.postMessage({
      kind: "error",
      message: error instanceof Error ? error.message : "Falha na conversão geoespacial.",
    });
  });
};

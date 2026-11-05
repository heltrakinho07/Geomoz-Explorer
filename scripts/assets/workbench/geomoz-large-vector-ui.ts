/**
 * Add Vector Layer integration for local GeoJSON >= 100 MB.
 * Keeps the original file untouched, converts in a cancellable Web Worker, then
 * delegates the GeoParquet to the pinned native vector control for tiled drawing.
 */
import { DUCKDB_VECTOR_ROUTE_BYTES } from "@geolibre/core";
import type { VectorControl } from "maplibre-gl-vector";
import type { GeoLibreAppAPI } from "../types";

export function isGeoMozLargeGeoJSON(source: unknown): source is File {
  return (
    typeof File !== "undefined" &&
    source instanceof File &&
    source.size >= DUCKDB_VECTOR_ROUTE_BYTES &&
    /\.(?:geojson|json)$/i.test(source.name)
  );
}

export function wireGeoMozLargeVector(control: VectorControl, app: GeoLibreAppAPI): void {
  const originalAddData = control.addData.bind(control);
  control.addData = (source, options) => {
    if (!isGeoMozLargeGeoJSON(source)) return originalAddData(source, options);

    const root = (control as unknown as { _panel?: HTMLElement })._panel ??
      control.getContainer();
    root?.querySelector(".geomoz-large-vector-progress")?.remove();

    const box = document.createElement("section");
    box.className = "geomoz-large-vector-progress";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    const description = document.createElement("p");
    description.className = "geomoz-large-vector-message";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "geomoz-large-vector-action";
    action.textContent = "Cancelar";
    box.append(description, action);
    root?.prepend(box);

    const controller = new AbortController();
    action.onclick = () => controller.abort();
    const progress = (label: string, percent?: number) => {
      description.textContent = source.name + " · " + label +
        (typeof percent === "number" ? " (" + percent + "%)" : "");
    };
    progress("A preparar o ficheiro de grande dimensão");

    return (async () => {
      try {
        if (!app.prepareLargeGeoJSONFile) {
          throw new Error("O processamento DuckDB-WASM não está disponível nesta versão.");
        }
        const parquet = await app.prepareLargeGeoJSONFile(source, {
          signal: controller.signal,
          onProgress: progress,
        });
        if (controller.signal.aborted) {
          const error = new Error("Importação cancelada.");
          error.name = "AbortError";
          throw error;
        }
        // DuckDB Spatial and vector tiles are already supported by the control.
        // Preserve the original title, style and restore options.
        progress("A carregar a camada optimizada no mapa");
        action.disabled = true;
        action.textContent = "A renderizar";
        const result = await originalAddData(parquet, {
          ...options,
          name: options?.name ?? source.name.replace(/\.(?:geojson|json)$/i, ""),
        });
        box.remove();
        return result;
      } catch (error) {
        const cancelled = controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError");
        box.setAttribute("role", "alert");
        progress(cancelled ? "Importação cancelada" :
          "Erro: " + (error instanceof Error ? error.message : "Não foi possível importar os dados."));
        action.disabled = false;
        action.textContent = "Fechar";
        action.onclick = () => box.remove();
        if (!cancelled) console.error("[GeoMoz] Erro ao importar GeoJSON grande", error);
        throw error;
      }
    })();
  };
}

/**
 * Add Vector Layer integration for local large GeoJSON files.
 *
 * Use the already integrated DuckDB-WASM Worker to prepare GeoParquet, then
 * delegate tiled rendering to the pinned maplibre-vector implementation.
 * The native vector panel stays responsive during conversion.
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

function fileSizeMib(file: File): string {
  return (file.size / (1024 * 1024)).toLocaleString("pt-PT", {
    maximumFractionDigits: 1,
  }) + " MB";
}

export function wireGeoMozLargeVector(control: VectorControl, app: GeoLibreAppAPI): void {
  const originalAddData = control.addData.bind(control);
  // One preparation at a time per Add Vector control. Cancelling the previous
  // request prevents a slow 150 MB geology import from racing a newer file.
  let current: AbortController | null = null;

  control.addData = (source, options) => {
    if (current) {
      current.abort();
      current = null;
    }
    if (!isGeoMozLargeGeoJSON(source)) return originalAddData(source, options);

    const root = (control as unknown as { _panel?: HTMLElement })._panel ??
      control.getContainer();
    root?.querySelector(".geomoz-large-vector-progress")?.remove();

    const controller = new AbortController();
    current = controller;

    const box = document.createElement("section");
    box.className = "geomoz-large-vector-progress";
    box.dataset.testid = "geomoz-large-vector-progress";
    box.setAttribute("role", "status");
    box.setAttribute("aria-label", "Importação de ficheiro vectorial grande");
    box.setAttribute("aria-live", "polite");

    const heading = document.createElement("strong");
    heading.className = "geomoz-large-vector-heading";
    heading.textContent = source.name + " · " + fileSizeMib(source);

    const description = document.createElement("p");
    description.className = "geomoz-large-vector-message";
    description.textContent = "A preparar a importação…";

    const meter = document.createElement("progress");
    meter.className = "geomoz-large-vector-meter";
    meter.max = 100;
    meter.setAttribute("aria-label", "Progresso da leitura de GeoJSON");
    // The conversion stage has no trustworthy percentage; use an
    // indeterminate progress bar rather than showing an invented figure.
    meter.removeAttribute("value");

    const actions = document.createElement("div");
    actions.className = "geomoz-large-vector-actions";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "geomoz-large-vector-action";
    action.textContent = "Cancelar importação";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "geomoz-large-vector-dismiss";
    close.textContent = "Fechar";
    close.hidden = true;
    actions.append(action, close);
    box.append(heading, description, meter, actions);
    root?.prepend(box);

    action.onclick = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      action.disabled = true;
      action.textContent = "A cancelar…";
      description.textContent = "A interromper a preparação do GeoJSON…";
    };
    const progress = (label: string, percent?: number) => {
      if (controller.signal.aborted || current !== controller) return;
      const bounded = typeof percent === "number" && Number.isFinite(percent)
        ? Math.max(0, Math.min(100, Math.round(percent)))
        : null;
      description.textContent = label + (bounded === null ? "" : " · " + bounded + "%");
      if (bounded === null) meter.removeAttribute("value");
      else meter.value = bounded;
    };

    return (async () => {
      try {
        if (!app.prepareLargeGeoJSONFile) {
          throw new Error("O processamento DuckDB-WASM não está disponível nesta versão.");
        }
        const parquet = await app.prepareLargeGeoJSONFile(source, {
          signal: controller.signal,
          onProgress: progress,
        });
        if (controller.signal.aborted || current !== controller) {
          const error = new Error("Importação cancelada.");
          error.name = "AbortError";
          throw error;
        }
        progress("A adicionar a camada GeoParquet ao mapa");
        // Native map rendering has no cancellation API. Make the final stage
        // explicit rather than presenting a Cancel button that cannot work.
        action.disabled = true;
        action.textContent = "A finalizar…";
        const result = await originalAddData(parquet, {
          ...options,
          format: "geoparquet",
          renderMode: "tiles",
          name: options?.name ?? source.name.replace(/\.(?:geojson|json)$/i, ""),
        });
        if (current === controller) {
          current = null;
          box.remove();
        }
        return result;
      } catch (error) {
        const cancelled = controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError");
        if (current === controller) current = null;
        // Another import owns the panel now. Never show stale errors over it.
        if (box.isConnected) {
          box.setAttribute("role", cancelled ? "status" : "alert");
          box.classList.toggle("geomoz-large-vector-error", !cancelled);
          description.textContent = cancelled
            ? "Importação cancelada. Nenhuma nova camada foi adicionada."
            : "Importação falhou: " +
              (error instanceof Error ? error.message : "Não foi possível ler os dados.");
          meter.hidden = true;
          action.disabled = false;
          action.textContent = "Tentar novamente";
          action.onclick = () => {
            box.remove();
            // The resulting promise is handled by the import panel itself;
            // suppress an unhandled rejection from this retry button.
            void Promise.resolve(control.addData(source, options)).catch(() => undefined);
          };
          close.hidden = false;
          close.onclick = () => box.remove();
        }
        if (!cancelled) console.error("[GeoMoz] Falha ao importar GeoJSON grande", error);
        throw error;
      }
    })();
  };
}

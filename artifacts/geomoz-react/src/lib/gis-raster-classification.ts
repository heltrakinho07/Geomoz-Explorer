/**
 * GeoMoz raster classification runtime.
 *
 * The discrete-class GPU injection follows the same rendering strategy used by
 * GeoLibre (MIT): it reuses maplibre-gl-raster's existing nodata/rescale/
 * stretch/gamma pipeline and replaces only the final colormap texture.
 *
 * Kept isolated because it touches private LayerManager internals. Every access
 * is feature-detected; if an upstream release changes those internals, GeoMoz
 * falls back to the normal continuous renderer instead of crashing the map.
 */
import { createColormapTexture } from "@developmentseed/deck.gl-raster/gpu-modules";
import type { RasterControl } from "maplibre-gl-raster";
import type { GISRasterBandStats, GISWorkspaceRasterLayer } from "@/lib/gis-raster";

export type GISRasterClassificationMethod =
  | "equal-interval"
  | "quantile"
  | "manual";

export interface GISRasterSymbology {
  classified: boolean;
  ramp: string;
  method: GISRasterClassificationMethod;
  classCount: number;
  breaks: number[];
  customColors?: string[];
}

type GpuTexture = { destroy?: () => void };
type RenderPipelineModule = {
  module?: { name?: string };
  props?: Record<string, unknown>;
};
type RenderTileResult = { renderPipeline?: RenderPipelineModule[] } | null;
type RenderTileFn = (data: unknown) => RenderTileResult;
type RasterLayerLike = {
  id: string;
  state?: { mode?: string };
};
type RasterLayerManagerLike = {
  _device?: unknown;
  _renderTileFor?: (layer: RasterLayerLike) => RenderTileFn;
  _rebuild?: () => void;
};
type RasterControlLike = {
  _layerManager?: RasterLayerManagerLike;
  getEngine?: () => string;
  setEngine?: (engine: "maplibre-gl-raster" | "cog-tiler-wasm") => void;
};

type ClassificationEntry = {
  symbology: GISRasterSymbology;
  reversed: boolean;
  key: string;
  texture?: GpuTexture;
};

type ClassificationRuntime = {
  patched: boolean;
  entries: Map<string, ClassificationEntry>;
};

const runtimes = new WeakMap<object, ClassificationRuntime>();

export const GIS_RASTER_RAMPS: Record<string, string[]> = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  terrain: ["#174a7e", "#2f8f6b", "#a8b95d", "#b48555", "#f5f5f5"],
  turbo: ["#30123b", "#466be3", "#22b5a9", "#a4fc3c", "#f9ba38", "#e43b1f"],
  magma: ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
  plasma: ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"],
  gray: ["#111827", "#f8fafc"],
};

function clampClassCount(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(2, Math.min(12, Math.round(value)));
}

function percentile(stats: GISRasterBandStats, fraction: number): number {
  const bins = stats.histogram.length;
  const total = stats.histogram.reduce((sum, count) => sum + count, 0);
  if (bins === 0 || total === 0 || stats.max <= stats.min) {
    return stats.min + (stats.max - stats.min) * fraction;
  }

  const target = Math.min(1, Math.max(0, fraction)) * total;
  const binWidth = (stats.max - stats.min) / bins;
  let accumulated = 0;

  for (let index = 0; index < bins; index += 1) {
    const count = stats.histogram[index];
    if (accumulated + count >= target) {
      const within = count > 0 ? (target - accumulated) / count : 0;
      return stats.min + (index + within) * binWidth;
    }
    accumulated += count;
  }
  return stats.max;
}

export function computeGISRasterBreaks(
  method: GISRasterClassificationMethod,
  stats: GISRasterBandStats,
  classCount: number,
  manualBreaks?: number[]
): number[] {
  const count = clampClassCount(classCount);

  if (method === "manual" && manualBreaks?.length === count + 1) {
    const clean = manualBreaks.filter(Number.isFinite).sort((a, b) => a - b);
    if (clean.length === count + 1) return clean;
  }

  if (method === "quantile") {
    return Array.from({ length: count + 1 }, (_, index) =>
      percentile(stats, index / count)
    );
  }

  const span = stats.max - stats.min;
  return Array.from({ length: count + 1 }, (_, index) =>
    index === count ? stats.max : stats.min + (span * index) / count
  );
}

function parseHex(color: string): [number, number, number] {
  const normalized = color.trim().replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const value = Number.parseInt(full.padEnd(6, "0").slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpolateColors(colors: string[], count: number): string[] {
  if (count <= 1) return [colors[0] ?? "#2563eb"];
  if (colors.length <= 1) return Array.from({ length: count }, () => colors[0] ?? "#2563eb");

  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const scaled = t * (colors.length - 1);
    const lowIndex = Math.floor(scaled);
    const highIndex = Math.min(colors.length - 1, lowIndex + 1);
    const local = scaled - lowIndex;
    const low = parseHex(colors[lowIndex]);
    const high = parseHex(colors[highIndex]);
    return toHex(
      low[0] + (high[0] - low[0]) * local,
      low[1] + (high[1] - low[1]) * local,
      low[2] + (high[2] - low[2]) * local
    );
  });
}

export function rasterClassColors(symbology: GISRasterSymbology): string[] {
  const count = Math.max(1, symbology.breaks.length - 1);
  const base =
    symbology.customColors && symbology.customColors.length >= 2
      ? symbology.customColors
      : GIS_RASTER_RAMPS[symbology.ramp] ?? GIS_RASTER_RAMPS.viridis;
  return interpolateColors(base, count);
}

export function defaultGISRasterSymbology(
  stats: GISRasterBandStats,
  ramp = "viridis"
): GISRasterSymbology {
  const classCount = 5;
  return {
    classified: false,
    ramp,
    method: "equal-interval",
    classCount,
    breaks: computeGISRasterBreaks("equal-interval", stats, classCount),
  };
}

function buildSteppedTexture(
  symbology: GISRasterSymbology,
  reversed: boolean
): Uint8ClampedArray {
  const width = 256;
  const rgba = new Uint8ClampedArray(width * 4);
  const breaks = symbology.breaks;
  const classCount = Math.max(1, breaks.length - 1);
  const colors = rasterClassColors(symbology);
  const ordered = reversed ? [...colors].reverse() : colors;
  const min = breaks[0] ?? 0;
  const max = breaks.at(-1) ?? 1;
  const span = max - min;

  for (let column = 0; column < width; column += 1) {
    const t = column / (width - 1);
    const value = span > 0 ? min + t * span : min;
    let classIndex = classCount - 1;
    for (let edge = 1; edge < breaks.length; edge += 1) {
      if (value < breaks[edge]) {
        classIndex = edge - 1;
        break;
      }
    }
    const [r, g, b] = parseHex(ordered[classIndex] ?? ordered.at(-1) ?? "#000000");
    const offset = column * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }

  return rgba;
}

function entryKey(symbology: GISRasterSymbology, reversed: boolean): string {
  return JSON.stringify([
    symbology.classified,
    symbology.ramp,
    symbology.method,
    symbology.classCount,
    symbology.breaks,
    symbology.customColors ?? null,
    reversed,
  ]);
}

function ensureTexture(
  manager: RasterLayerManagerLike,
  entry: ClassificationEntry
): GpuTexture | null {
  if (!manager._device) return null;
  const key = entryKey(entry.symbology, entry.reversed);
  if (entry.texture && entry.key === key) return entry.texture;

  entry.texture?.destroy?.();
  try {
    const rgba = buildSteppedTexture(entry.symbology, entry.reversed);
    const image = new ImageData(
      rgba as Uint8ClampedArray<ArrayBuffer>,
      256,
      1
    );
    entry.texture = createColormapTexture(
      manager._device as never,
      image
    ) as GpuTexture;
    entry.key = key;
    return entry.texture;
  } catch (error) {
    console.warn("[GeoMoz] Não foi possível criar a textura de classificação raster.", error);
    entry.texture = undefined;
    return null;
  }
}

function installClassificationPatch(control: RasterControlLike): ClassificationRuntime | null {
  const manager = control._layerManager;
  if (!manager || typeof manager._renderTileFor !== "function") return null;

  let runtime = runtimes.get(control as object);
  if (!runtime) {
    runtime = { patched: false, entries: new Map() };
    runtimes.set(control as object, runtime);
  }
  if (runtime.patched) return runtime;

  const original = manager._renderTileFor.bind(manager);
  manager._renderTileFor = (layer: RasterLayerLike): RenderTileFn => {
    const renderTile = original(layer);
    return (data: unknown): RenderTileResult => {
      const result = renderTile(data);
      const entry = runtime!.entries.get(layer.id);
      const pipeline = result?.renderPipeline;
      if (
        layer.state?.mode !== "single" ||
        !entry?.symbology.classified ||
        !Array.isArray(pipeline)
      ) {
        return result;
      }

      const texture = ensureTexture(manager, entry);
      if (!texture) return result;

      return {
        ...result,
        renderPipeline: pipeline.map((module) =>
          module?.module?.name === "colormap"
            ? {
                ...module,
                props: {
                  ...module.props,
                  colormapTexture: texture,
                  colormapIndex: 0,
                  reversed: false,
                },
              }
            : module
        ),
      };
    };
  };

  runtime.patched = true;
  return runtime;
}

export function syncGISRasterClassification(
  control: RasterControl,
  layers: GISWorkspaceRasterLayer[]
): void {
  const typed = control as unknown as RasterControlLike;
  const manager = typed._layerManager;
  const runtime = installClassificationPatch(typed);
  if (!manager || !runtime) return;

  let changed = false;
  let needsDeckEngine = false;
  const seen = new Set<string>();

  for (const layer of layers) {
    const symbology = layer.rasterSymbology;
    if (
      !symbology?.classified ||
      (layer.rasterState?.mode ?? "single") !== "single" ||
      symbology.breaks.length < 3
    ) {
      continue;
    }

    seen.add(layer.id);
    needsDeckEngine = true;
    const reversed = layer.rasterState?.reversed === true;
    const key = entryKey(symbology, reversed);
    const existing = runtime.entries.get(layer.id);
    if (!existing) {
      runtime.entries.set(layer.id, { symbology, reversed, key });
      changed = true;
    } else if (existing.key !== key) {
      existing.texture?.destroy?.();
      existing.texture = undefined;
      existing.symbology = symbology;
      existing.reversed = reversed;
      existing.key = key;
      changed = true;
    }
  }

  for (const [id, entry] of [...runtime.entries.entries()]) {
    if (!seen.has(id)) {
      entry.texture?.destroy?.();
      runtime.entries.delete(id);
      changed = true;
    }
  }

  if (needsDeckEngine && typed.getEngine?.() !== "maplibre-gl-raster") {
    typed.setEngine?.("maplibre-gl-raster");
    changed = true;
  }

  if (changed) manager._rebuild?.();
}

export function disposeGISRasterClassification(
  control: RasterControl,
  layerId?: string
): void {
  const runtime = runtimes.get(control as object);
  if (!runtime) return;
  if (layerId) {
    runtime.entries.get(layerId)?.texture?.destroy?.();
    runtime.entries.delete(layerId);
    return;
  }
  for (const entry of runtime.entries.values()) entry.texture?.destroy?.();
  runtime.entries.clear();
}

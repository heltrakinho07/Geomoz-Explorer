/**
 * GeoMoz GIS Workspace raster runtime.
 *
 * Architecture inspired by GeoLibre's maplibre-gl-raster integration (MIT):
 * https://github.com/opengeos/GeoLibre
 *
 * GeoMoz deliberately keeps its own workspace state/UI and uses the upstream
 * RasterControl only as a rendering/decoding engine for GeoTIFF/COG data.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  RasterControl,
  AutoStats,
  RasterLayerInfo,
  RasterLayerState,
} from "maplibre-gl-raster";

export interface GISWorkspaceRasterLayer {
  id: string;
  name: string;
  file?: File;
  remoteUrl?: string;
  sourceType?: "storage" | "url";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visible: boolean;
  opacity: number;
  isResult?: boolean;
  bandCount?: number | null;
  bounds?: [number, number, number, number] | null;
  error?: string | null;
  rasterState?: Partial<RasterLayerState>;
}

export interface GISRasterBandStats {
  min: number;
  max: number;
  histogram: number[];
}

export interface GISWorkspaceRasterMetadata {
  id: string;
  bandCount: number | null;
  bounds: [number, number, number, number] | null;
  error: string | null;
  rasterState: Partial<RasterLayerState>;
}

type RasterControlConstructor = new (options?: Record<string, unknown>) => RasterControl;

const controls = new WeakMap<MapLibreMap, Promise<RasterControl>>();
const statsCache = new Map<string, AutoStats>();

function rasterBounds(info: RasterLayerInfo): [number, number, number, number] | null {
  if (!info.bounds) return null;
  return [
    info.bounds.west,
    info.bounds.south,
    info.bounds.east,
    info.bounds.north,
  ];
}

function metadataFromInfo(info: RasterLayerInfo): GISWorkspaceRasterMetadata {
  const { visible: _visible, opacity: _opacity, ...rasterState } = info.state;
  return {
    id: info.id,
    bandCount: info.bandCount ?? null,
    bounds: rasterBounds(info),
    error: info.error?.message ?? null,
    rasterState,
  };
}

async function createRasterControl(map: MapLibreMap): Promise<RasterControl> {
  const module = await import("maplibre-gl-raster");
  const RasterControlClass = module.RasterControl as unknown as RasterControlConstructor;
  const control = new RasterControlClass({
    className: "geomoz-raster-runtime",
    collapsed: true,
    closeOnOutsideClick: false,
    engine: "cog-tiler-wasm",
    interleaved: true,
    panelWidth: 360,
    title: "GeoMoz Raster",
  });

  map.addControl(control as any, "top-left");
  const container = control.getContainer?.();
  if (container) container.style.display = "none";
  return control;
}

export function ensureGISWorkspaceRasterControl(
  map: MapLibreMap
): Promise<RasterControl> {
  let pending = controls.get(map);
  if (!pending) {
    pending = createRasterControl(map).catch((error) => {
      controls.delete(map);
      throw error;
    });
    controls.set(map, pending);
  }
  return pending;
}

function sourceIds(control: RasterControl): Set<string> {
  return new Set(control.getRasters().map((raster) => raster.id));
}

async function addRaster(
  control: RasterControl,
  layer: GISWorkspaceRasterLayer
): Promise<RasterLayerInfo | null> {
  const source = layer.file ?? layer.remoteUrl;
  if (!source) {
    throw new Error(`A camada raster "${layer.name}" não tem ficheiro local nem URL cloud.`);
  }

  await control.addRaster(source, {
    id: layer.id,
    name: layer.name,
    zoomTo: false,
    state: {
      ...layer.rasterState,
      visible: layer.visible,
      opacity: layer.opacity,
    } as Partial<RasterLayerState>,
  });
  return control.getRaster(layer.id) ?? null;
}

/**
 * Mirrors the GeoMoz raster store into maplibre-gl-raster.
 *
 * The control never owns application state: removed GeoMoz layers are removed
 * from the renderer, while visibility/opacity are pushed down from React.
 */
export async function syncGISWorkspaceRasters(
  map: MapLibreMap,
  layers: GISWorkspaceRasterLayer[],
  callbacks: {
    onMetadata?: (metadata: GISWorkspaceRasterMetadata) => void;
    onError?: (layerId: string, message: string) => void;
  } = {}
): Promise<void> {
  const control = await ensureGISWorkspaceRasterControl(map);
  const desired = new Set(layers.map((layer) => layer.id));

  for (const info of control.getRasters()) {
    if (!desired.has(info.id)) control.removeRaster(info.id);
  }

  let existing = sourceIds(control);

  for (const layer of layers) {
    try {
      let info = control.getRaster(layer.id) ?? null;
      if (!existing.has(layer.id)) {
        info = await addRaster(control, layer);
        existing = sourceIds(control);
      }

      control.setVisible(layer.id, layer.visible);
      control.setRasterState(layer.id, {
        ...layer.rasterState,
        opacity: layer.opacity,
      });

      const refreshed = control.getRaster(layer.id) ?? info;
      if (refreshed) callbacks.onMetadata?.(metadataFromInfo(refreshed));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      callbacks.onError?.(layer.id, message);
    }
  }
}

/**
 * Re-applies raster state after a MapLibre style swap. Native raster layers can
 * be recreated lazily by the control when their state changes.
 */
export async function refreshGISWorkspaceRasters(
  map: MapLibreMap,
  layers: GISWorkspaceRasterLayer[]
): Promise<void> {
  const control = await ensureGISWorkspaceRasterControl(map);
  for (const layer of layers) {
    if (!control.getRaster(layer.id)) continue;
    control.setVisible(layer.id, layer.visible);
    control.setRasterState(layer.id, {
      ...layer.rasterState,
      opacity: layer.opacity,
    });
  }
}


function rasterStatsCacheKey(layer: GISWorkspaceRasterLayer): string {
  if (layer.file) {
    return `${layer.id}:file:${layer.file.size}:${layer.file.lastModified}`;
  }
  return `${layer.id}:url:${layer.remoteUrl ?? ""}`;
}

function bandStatsFromAutoStats(
  stats: AutoStats,
  band: number
): GISRasterBandStats | null {
  const candidate = stats.perBand ? stats.perBand.get(band) ?? null : stats.global;
  if (!candidate) return null;
  return {
    min: candidate.min,
    max: candidate.max,
    histogram: [...candidate.histogram],
  };
}

export async function getGISRasterBandStats(
  layer: GISWorkspaceRasterLayer,
  band: number,
  signal?: AbortSignal
): Promise<GISRasterBandStats | null> {
  const key = rasterStatsCacheKey(layer);
  const cached = statsCache.get(key);
  if (cached) return bandStatsFromAutoStats(cached, band);

  let objectUrl: string | null = null;
  const source = layer.file
    ? (objectUrl = URL.createObjectURL(layer.file))
    : layer.remoteUrl;
  if (!source) return null;

  try {
    const { computeAutoStats, loadGeoTIFF } = await import("maplibre-gl-raster");
    const tiff = await loadGeoTIFF(source);
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const stats = await computeAutoStats(tiff, controller.signal);
    statsCache.set(key, stats);
    return bandStatsFromAutoStats(stats, band);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function rasterHistogramPercentile(
  stats: GISRasterBandStats,
  fraction: number
): number {
  const total = stats.histogram.reduce((sum, count) => sum + count, 0);
  if (total === 0 || stats.max <= stats.min || stats.histogram.length === 0) {
    return stats.min + (stats.max - stats.min) * fraction;
  }

  const target = total * Math.min(1, Math.max(0, fraction));
  const width = (stats.max - stats.min) / stats.histogram.length;
  let accumulated = 0;
  for (let index = 0; index < stats.histogram.length; index += 1) {
    const count = stats.histogram[index];
    if (accumulated + count >= target) {
      const within = count > 0 ? (target - accumulated) / count : 0;
      return stats.min + (index + within) * width;
    }
    accumulated += count;
  }
  return stats.max;
}

export function autoGISRasterStretch(
  stats: GISRasterBandStats
): [number, number] {
  return [
    rasterHistogramPercentile(stats, 0.02),
    rasterHistogramPercentile(stats, 0.98),
  ];
}

export function clearGISRasterStats(layerId: string): void {
  for (const key of statsCache.keys()) {
    if (key.startsWith(`${layerId}:`)) statsCache.delete(key);
  }
}

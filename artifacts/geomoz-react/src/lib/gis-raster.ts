/**
 * GeoMoz GIS Workspace raster runtime.
 *
 * GeoMoz keeps its own workspace state/UI and uses the upstream RasterControl
 * as the rendering/decoding engine for GeoTIFF/COG data.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  resolveStacAssetHref,
  type GISStacRasterSource,
} from "@/lib/stac-client";
import {
  syncGISRasterClassification,
  type GISRasterSymbology,
} from "@/lib/gis-raster-classification";
import type {
  RasterControl,
  RasterLayerInfo,
  RasterLayerState,
} from "maplibre-gl-raster";

export interface GISWorkspaceRasterLayer {
  id: string;
  name: string;
  file?: File;
  remoteUrl?: string;
  sourceType?: "storage" | "url" | "stac";
  stacSource?: GISStacRasterSource;
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
  rasterSymbology?: GISRasterSymbology;
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
const statsCache = new Map<string, GISRasterBandStats>();

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

export async function resolveGISRasterRemoteUrl(
  layer: GISWorkspaceRasterLayer
): Promise<string | undefined> {
  if (layer.sourceType === "stac" && layer.stacSource) {
    return resolveStacAssetHref(layer.stacSource);
  }
  return layer.remoteUrl;
}

async function addRaster(
  control: RasterControl,
  layer: GISWorkspaceRasterLayer
): Promise<RasterLayerInfo | null> {
  const source = layer.file ?? (await resolveGISRasterRemoteUrl(layer));
  if (!source) {
    throw new Error(`A camada raster "${layer.name}" não tem ficheiro local nem URL remoto.`);
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

  syncGISRasterClassification(control, layers);
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
  syncGISRasterClassification(control, layers);
}


function rasterStatsCacheKey(layer: GISWorkspaceRasterLayer): string {
  if (layer.file) {
    return `${layer.id}:file:${layer.file.size}:${layer.file.lastModified}`;
  }
  return `${layer.id}:url:${layer.remoteUrl ?? ""}`;
}

/** Independent of the map renderer; TIFF bands are zero-based at the decoder boundary. */
export async function getGISRasterBandStats(
  layer: GISWorkspaceRasterLayer, band: number, signal?: AbortSignal
): Promise<GISRasterBandStats | null> {
  const key = rasterStatsCacheKey(layer) + ":band:" + band;
  const cached = statsCache.get(key); if (cached) return cached;
  if (signal?.aborted) throw new DOMException("Operação cancelada.", "AbortError");
  const source = layer.file ?? await resolveGISRasterRemoteUrl(layer);
  if (!source) return null;
  const { fromBlob, fromUrl } = await import("geotiff");
  const tiff = typeof source === "string" ? await fromUrl(source, { allowFullFile: false }) : await fromBlob(source);
  try {
    let image = await tiff.getImage();
    if (!Number.isInteger(band) || band < 1 || band > image.getSamplesPerPixel()) return null;
    const count = Math.min(32, await tiff.getImageCount());
    for (let index = 1; index < count; index++) {
      const candidate = await tiff.getImage(index);
      if (candidate.getSamplesPerPixel() >= band && candidate.getWidth() >= 256 &&
          candidate.getWidth() < image.getWidth()) image = candidate;
    }
    const values = await image.readRasters({samples:[band - 1], interleave:true,
      width:Math.min(512,image.getWidth()), height:Math.min(512,image.getHeight()), signal});
    const nodata = image.getGDALNoData();
    let min = Infinity, max = -Infinity;
    for (let i=0;i<values.length;i++) {
      const value = Number(values[i]);
      if (Number.isFinite(value) && value !== nodata) { min=Math.min(min,value);max=Math.max(max,value); }
    }
    if (!Number.isFinite(min)) return null;
    const histogram = Array<number>(256).fill(0), span = max-min;
    for (let i=0;i<values.length;i++) {
      const value = Number(values[i]);if(!Number.isFinite(value)||value===nodata)continue;
      const bin = span > 0 ? Math.min(255,Math.floor((value-min)/span*256)) : 0;
      histogram[bin]++;
    }
    const stats = {min,max,histogram};statsCache.set(key,stats);return stats;
  } finally { await tiff.close(); }
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

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
  RasterLayerInfo,
  RasterLayerState,
} from "maplibre-gl-raster";

export interface GISWorkspaceRasterLayer {
  id: string;
  name: string;
  file?: File;
  remoteUrl?: string;
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

export interface GISWorkspaceRasterMetadata {
  id: string;
  bandCount: number | null;
  bounds: [number, number, number, number] | null;
  error: string | null;
  rasterState: Partial<RasterLayerState>;
}

type RasterControlConstructor = new (options?: Record<string, unknown>) => RasterControl;

const controls = new WeakMap<MapLibreMap, Promise<RasterControl>>();

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

/**
 * Browser-only Global DEM. Adapted from the GeoLibre (MIT) global-dem algorithm:
 * https://github.com/opengeos/GeoLibre/blob/main/apps/geolibre-desktop/src/lib/global-dem.ts
 * https://github.com/opengeos/GeoLibre/blob/main/packages/processing/src/cog-convert.ts
 * Copyright (c) 2026 Qiusheng Wu. GeoLibre MIT license.
 *
 * Downloads public AWS Terrain Tiles as GeoTIFFs, mosaics/crops within the
 * browser and emits a tiled float32 COG via the same geolibre-wasm CogBuilder.
 * No Firebase/Storage/database uploads, no backend, no simulated DEM pixels.
 */
export const GLOBAL_DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif";
export const GLOBAL_DEM_TILE_SIZE = 512;
export const GLOBAL_DEM_MAX_TILES = 64;
const MAX_ZOOM = 12;
const MERCATOR_LATITUDE_LIMIT = 85.051129;
const EARTH_RADIUS = 6378137;
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS;
const NO_DATA = -32768;

export interface GlobalDemTileRange {
  zoom: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  westPixel: number;
  eastPixel: number;
  northPixel: number;
  southPixel: number;
}
export interface BrowserDemResult {
  file: File;
  bounds: [number, number, number, number];
  tileCount: number;
  zoom: number;
  width: number;
  height: number;
  resolutionMeters: number;
}

export function validateDemBounds(input: readonly number[]): [number, number, number, number] {
  if (
    input.length !== 4 || input.some(value => !Number.isFinite(value)) ||
    input[0] < -180 || input[2] > 180 ||
    input[1] < -MERCATOR_LATITUDE_LIMIT || input[3] > MERCATOR_LATITUDE_LIMIT ||
    input[0] >= input[2] || input[1] >= input[3]
  ) {
    throw new Error("Defina uma extensão WGS84 válida [oeste, sul, este, norte], sem cruzar o antimeridiano.");
  }
  return [input[0], input[1], input[2], input[3]];
}
function pixelX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * (2 ** zoom) * GLOBAL_DEM_TILE_SIZE;
}
function pixelY(lat: number, zoom: number) {
  const phi = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 *
    (2 ** zoom) * GLOBAL_DEM_TILE_SIZE;
}

export function globalDemTileRange(input: readonly number[]): GlobalDemTileRange {
  const [west, south, east, north] = validateDemBounds(input);
  for (let zoom = MAX_ZOOM; zoom >= 0; zoom--) {
    const westPixel = pixelX(west, zoom);
    const eastPixel = pixelX(east, zoom);
    const northPixel = pixelY(north, zoom);
    const southPixel = pixelY(south, zoom);
    const minX = Math.floor(westPixel / GLOBAL_DEM_TILE_SIZE);
    const maxX = Math.ceil(eastPixel / GLOBAL_DEM_TILE_SIZE) - 1;
    const minY = Math.floor(northPixel / GLOBAL_DEM_TILE_SIZE);
    const maxY = Math.ceil(southPixel / GLOBAL_DEM_TILE_SIZE) - 1;
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    if (count <= GLOBAL_DEM_MAX_TILES) {
      return { zoom, minX, maxX, minY, maxY, westPixel, eastPixel, northPixel, southPixel };
    }
  }
  throw new Error("Área demasiado extensa para processar o DEM no navegador.");
}
export function globalDemTileUrl(z: number, x: number, y: number): string {
  return GLOBAL_DEM_TILE_URL.replace("{z}", String(z))
    .replace("{x}", String(x)).replace("{y}", String(y));
}

async function readElevationTile(url: string, signal?: AbortSignal): Promise<Float32Array | null> {
  const response = await fetch(url, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Falha no serviço público de elevação (HTTP ${response.status}).`);
  const { fromArrayBuffer } = await import("geotiff");
  const geotiff = await fromArrayBuffer(await response.arrayBuffer());
  const image = await geotiff.getImage();
  if (image.getWidth() !== GLOBAL_DEM_TILE_SIZE || image.getHeight() !== GLOBAL_DEM_TILE_SIZE) {
    throw new Error("O serviço de elevação devolveu um mosaico GeoTIFF com dimensões inesperadas.");
  }
  const decoded = await image.readRasters({ samples: [0] });
  const band = Array.isArray(decoded) ? decoded[0] : decoded;
  const values = Float32Array.from(band as ArrayLike<number>);
  if (values.length !== GLOBAL_DEM_TILE_SIZE ** 2) throw new Error("Tile DEM incompleto.");
  const tileNodata = image.getGDALNoData();
  if (tileNodata != null && tileNodata !== NO_DATA) {
    for (let i = 0; i < values.length; i++) if (values[i] === tileNodata) values[i] = NO_DATA;
  }
  return values;
}

let cogInit: Promise<void> | null = null;
async function encodeDemCog(data: Float32Array, width: number, height: number,
  originX: number, originY: number, resolution: number): Promise<Uint8Array> {
  const lib = await import("geolibre-wasm");
  if (!cogInit) {
    cogInit = lib.default().then(() => undefined).catch((error: unknown) => {
      cogInit = null;
      throw error;
    });
  }
  await cogInit;
  const builder = new lib.CogBuilder(width, height, 1);
  try {
    builder.set_epsg(3857);
    builder.set_geo_transform(Float64Array.from([originX, resolution, 0, originY, 0, -resolution]));
    builder.set_nodata(NO_DATA);
    builder.set_tile_size(512);
    builder.set_compression("deflate");
    const levels: number[] = [];
    for (let factor = 2; Math.max(width, height) / factor > 256; factor *= 2) levels.push(factor);
    builder.set_overview_levels(Uint32Array.from(levels));
    return builder.write_f32(data);
  } finally {
    builder.free();
  }
}

/** Public elevation downloaded and decoded locally; emits a georeferenced COG File. */
export async function downloadGlobalDem(
  input: readonly number[],
  options: { signal?: AbortSignal; onProgress?: (completed: number, total: number) => void } = {}
): Promise<BrowserDemResult> {
  const bounds = validateDemBounds(input);
  const range = globalDemTileRange(bounds);
  const tileWidth = range.maxX - range.minX + 1;
  const tileHeight = range.maxY - range.minY + 1;
  const mosaicWidth = tileWidth * GLOBAL_DEM_TILE_SIZE;
  const mosaicHeight = tileHeight * GLOBAL_DEM_TILE_SIZE;
  const mosaic = new Float32Array(mosaicWidth * mosaicHeight).fill(NO_DATA);
  const tasks: { x: number; y: number }[] = [];
  for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) tasks.push({ x, y });
  }
  let completed = 0, loaded = 0;
  // Limit concurrent decoding/network requests to keep memory bounded on phones.
  for (let offset = 0; offset < tasks.length; offset += 4) {
    if (options.signal?.aborted) throw new DOMException("DEM cancelado.", "AbortError");
    await Promise.all(tasks.slice(offset, offset + 4).map(async ({ x, y }) => {
      const band = await readElevationTile(globalDemTileUrl(range.zoom, x, y), options.signal);
      if (band) {
        loaded++;
        const left = (x - range.minX) * GLOBAL_DEM_TILE_SIZE;
        const top = (y - range.minY) * GLOBAL_DEM_TILE_SIZE;
        for (let row = 0; row < GLOBAL_DEM_TILE_SIZE; row++) {
          mosaic.set(
            band.subarray(row * GLOBAL_DEM_TILE_SIZE, (row + 1) * GLOBAL_DEM_TILE_SIZE),
            (top + row) * mosaicWidth + left
          );
        }
      }
      options.onProgress?.(++completed, tasks.length);
    }));
  }
  if (!loaded) throw new Error("Sem mosaicos de elevação disponíveis para esta área.");
  if (options.signal?.aborted) throw new DOMException("DEM cancelado.", "AbortError");
  const left = Math.max(0, Math.floor(range.westPixel - range.minX * GLOBAL_DEM_TILE_SIZE));
  const right = Math.min(mosaicWidth, Math.ceil(range.eastPixel - range.minX * GLOBAL_DEM_TILE_SIZE));
  const top = Math.max(0, Math.floor(range.northPixel - range.minY * GLOBAL_DEM_TILE_SIZE));
  const bottom = Math.min(mosaicHeight, Math.ceil(range.southPixel - range.minY * GLOBAL_DEM_TILE_SIZE));
  const width = right - left, height = bottom - top;
  if (width < 2 || height < 2) throw new Error("Extensão DEM demasiado pequena.");
  const cropped = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    cropped.set(mosaic.subarray((row + top) * mosaicWidth + left,
      (row + top) * mosaicWidth + left + width), row * width);
  }
  const resolution = 2 * ORIGIN_SHIFT / (2 ** range.zoom * GLOBAL_DEM_TILE_SIZE);
  const originX = -ORIGIN_SHIFT + (range.minX * GLOBAL_DEM_TILE_SIZE + left) * resolution;
  const originY = ORIGIN_SHIFT - (range.minY * GLOBAL_DEM_TILE_SIZE + top) * resolution;
  const bytes = await encodeDemCog(cropped, width, height, originX, originY, resolution);
  if (options.signal?.aborted) throw new DOMException("DEM cancelado.", "AbortError");
  const name = `geomoz_dem_${bounds.map(v => v.toFixed(2)).join("_")}.tif`;
  const file = new File([new Uint8Array(bytes)], name, { type: "image/tiff" });
  return { file, bounds, tileCount: loaded, zoom: range.zoom, width, height, resolutionMeters: resolution };
}

/**
 * Browser-side GeoTIFF -> Cloud Optimized GeoTIFF conversion for GeoMoz.
 *
 * Adapted from GeoLibre's MIT-licensed COG conversion architecture:
 * https://github.com/opengeos/GeoLibre
 *
 * GeoMoz keeps this small adapter isolated so Whitebox raster outputs are
 * normalized before entering the GIS Workspace renderer/persistence pipeline.
 */
import init, { CogBuilder, GeoTiffReader } from "geolibre-wasm";

interface GeoTiffInfo {
  ok: boolean;
  width: number;
  height: number;
  bands: number;
  bits_per_sample: number;
  sample_format: string;
}

const COG_TILE_SIZE = 512;
const MAX_BROWSER_COG_CONVERSION_SAMPLES = 100_000_000;

let wasmReady: Promise<void> | null = null;

async function initCogWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init().then(
      () => undefined,
      (error: unknown) => {
        wasmReady = null;
        throw error;
      }
    );
  }
  await wasmReady;
}

function overviewLevels(width: number, height: number): Uint32Array {
  const levels: number[] = [];
  let factor = 2;
  while (Math.max(width, height) / factor > 256) {
    levels.push(factor);
    factor *= 2;
  }
  return Uint32Array.from(levels);
}

export async function convertGeoTiffToCog(bytes: Uint8Array): Promise<Uint8Array> {
  await initCogWasm();
  const reader = new GeoTiffReader(bytes);
  try {
    const info = JSON.parse(reader.info_json()) as GeoTiffInfo;
    if (!info.ok) throw new Error("A saída Whitebox não é um GeoTIFF legível.");

    const samples = info.width * info.height * Math.max(info.bands, 1);
    if (!Number.isSafeInteger(samples) || samples > MAX_BROWSER_COG_CONVERSION_SAMPLES) {
      throw new Error(
        `O raster possui ${samples.toLocaleString()} amostras decodificadas e excede o limite seguro de conversão COG no browser.`
      );
    }

    const builder = new CogBuilder(reader.width, reader.height, reader.bands);
    try {
      const epsg = reader.epsg;
      if (typeof epsg === "number" && Number.isFinite(epsg)) {
        builder.set_epsg(epsg);
      }

      const transform = reader.geo_transform();
      if (transform.length >= 6) builder.set_geo_transform(transform);

      const nodata = reader.nodata;
      if (typeof nodata === "number" && Number.isFinite(nodata)) {
        builder.set_nodata(nodata);
      }

      builder.set_tile_size(COG_TILE_SIZE);
      builder.set_compression("deflate");
      builder.set_overview_levels(overviewLevels(reader.width, reader.height));

      const pixels = reader.read_all_f64();
      const isByte = info.sample_format === "uint" && info.bits_per_sample <= 8;
      return isByte
        ? builder.write_u8(Uint8Array.from(pixels))
        : builder.write_f32(Float32Array.from(pixels));
    } finally {
      builder.free();
    }
  } finally {
    reader.free();
  }
}

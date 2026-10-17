/**
 * Browser-only GeoTIFF -> tiled COG, adapted from GeoLibre (MIT):
 * https://github.com/opengeos/GeoLibre/blob/main/packages/processing/src/cog-convert.ts
 * Copyright (c) 2026 Qiusheng Wu. MIT license:
 * https://github.com/opengeos/GeoLibre/blob/main/LICENSE
 *
 * The MapLibre RasterControl can fail on striped GeoTIFFs. Read their pixels
 * locally and convert to a COG with geolibre-wasm instead of uploading to a
 * backend, Firebase Storage or a cloud conversion service.
 */
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_DECODED_SAMPLES = 40_000_000;
const TILE_SIZE = 512;

interface TiffHeader {
  ok: boolean;
  width: number;
  height: number;
  bands: number;
  tiled: boolean;
  bits_per_sample?: number;
  sample_format?: string;
}
type GeoLibreCogModule = typeof import("geolibre-wasm");
let wasmReady: Promise<GeoLibreCogModule> | null = null;

export async function loadGISLocalCogWasm(): Promise<GeoLibreCogModule> {
  if (!wasmReady) {
    wasmReady = import("geolibre-wasm").then(async module => {
      await module.default();
      return module;
    }).catch(error => {
      wasmReady = null;
      throw error;
    });
  }
  return wasmReady;
}

function getOverviewLevels(width: number, height: number): Uint32Array {
  const levels: number[] = [];
  for (let factor = 2; Math.max(width, height) / factor > 256; factor *= 2) levels.push(factor);
  return Uint32Array.from(levels);
}

export interface PreparedLocalRaster {
  file: File;
  converted: boolean;
  width: number;
  height: number;
  bands: number;
}

export async function prepareLocalGeoTiff(file: File): Promise<PreparedLocalRaster> {
  if (!/\.tiff?$/i.test(file.name)) {
    throw new Error("Seleccione um ficheiro GeoTIFF (.tif ou .tiff).");
  }
  if (!file.size || file.size > MAX_INPUT_BYTES) {
    throw new Error("GeoTIFF vazio ou demasiado grande (>256 MB) para conversão em memória.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const module = await loadGISLocalCogWasm();
  const metadata = JSON.parse(module.geotiff_info(bytes)) as TiffHeader;
  if (!metadata.ok || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) ||
      !Number.isSafeInteger(metadata.bands) || metadata.width <= 0 || metadata.height <= 0 ||
      metadata.bands <= 0) throw new Error("O ficheiro não contém um GeoTIFF válido.");
  if (metadata.tiled) {
    return { file, converted: false, width: metadata.width,
      height: metadata.height, bands: metadata.bands };
  }
  const count = metadata.width * metadata.height * metadata.bands;
  if (!Number.isSafeInteger(count) || count > MAX_DECODED_SAMPLES) {
    throw new Error(
      `Raster com ${count.toLocaleString("pt-PT")} amostras; ultrapassa o limite seguro de ${MAX_DECODED_SAMPLES.toLocaleString("pt-PT")}. Converta para COG com GDAL/QGIS antes de importar.`
    );
  }

  const reader = new module.GeoTiffReader(bytes);
  try {
    const builder = new module.CogBuilder(reader.width, reader.height, reader.bands);
    try {
      if (typeof reader.epsg === "number" && Number.isFinite(reader.epsg)) builder.set_epsg(reader.epsg);
      else if (reader.proj_string) builder.set_proj_string(reader.proj_string);
      const transform = reader.geo_transform();
      if (transform.length >= 6) builder.set_geo_transform(transform);
      if (typeof reader.nodata === "number" && Number.isFinite(reader.nodata)) builder.set_nodata(reader.nodata);
      builder.set_tile_size(TILE_SIZE);
      builder.set_compression("deflate");
      builder.set_overview_levels(getOverviewLevels(reader.width, reader.height));
      const raw = reader.read_all_f64();
      const isByte = metadata.sample_format === "uint" && (metadata.bits_per_sample ?? 32) <= 8;
      const encoded = isByte
        ? builder.write_u8(Uint8Array.from(raw))
        : builder.write_f32(Float32Array.from(raw));
      const converted = new File([new Uint8Array(encoded)], file.name, { type: "image/tiff" });
      return { file: converted, converted: true, width: reader.width,
        height: reader.height, bands: reader.bands };
    } finally {
      builder.free();
    }
  } finally {
    reader.free();
  }
}

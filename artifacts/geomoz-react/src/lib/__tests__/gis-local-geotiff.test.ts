import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tiled: false,
  epsg: 32736 as number,
  bands: 1,
  width: 2,
  height: 2,
  values: [100, 120, 140, 160] as number[],
  writeF32: vi.fn(() => Uint8Array.from([73, 73, 42, 0])),
  builderFreed: vi.fn(),
  readerFreed: vi.fn(),
  setEpsg: vi.fn(),
}));

vi.mock("geolibre-wasm", () => ({
  default: async () => {},
  geotiff_info: () => JSON.stringify({
    ok: true,
    width: state.width,
    height: state.height,
    bands: state.bands,
    tiled: state.tiled,
    sample_format: "int",
    bits_per_sample: 16,
  }),
  GeoTiffReader: class {
    get width() { return state.width; }
    get height() { return state.height; }
    get bands() { return state.bands; }
    get epsg() { return state.epsg; }
    get nodata() { return -32768; }
    geo_transform() { return Float64Array.from([250000, 30, 0, 8900000, 0, -30]); }
    read_all_f64() { return Float64Array.from(state.values); }
    free() { state.readerFreed(); }
  },
  CogBuilder: class {
    set_epsg(value: number) { state.setEpsg(value); }
    set_geo_transform = vi.fn();
    set_nodata = vi.fn();
    set_tile_size = vi.fn();
    set_compression = vi.fn();
    set_overview_levels = vi.fn();
    write_f32(data: Float32Array) { return state.writeF32(data); }
    write_u8 = vi.fn(() => Uint8Array.from([73, 73, 42, 0]));
    free() { state.builderFreed(); }
  },
}));

import { prepareLocalGeoTiff } from "../gis-local-geotiff";

function localFile() {
  return new File([Uint8Array.from([73, 73, 42, 0, 0, 0, 0, 0])], "maputo_dem.tif", {
    type: "image/tiff",
  });
}

afterEach(() => {
  state.tiled = false;
  state.epsg = 32736;
  state.width = 2;
  state.height = 2;
  state.bands = 1;
  state.values = [100, 120, 140, 160];
  state.writeF32.mockClear();
  state.setEpsg.mockClear();
  state.builderFreed.mockClear();
  state.readerFreed.mockClear();
});

describe("Local raster GeoLibre COG conversion", () => {
  it("leaves a properly tiled source intact and does not copy its pixel data", async () => {
    state.tiled = true;
    const file = localFile();
    const result = await prepareLocalGeoTiff(file);
    expect(result.converted).toBe(false);
    expect(result.file).toBe(file);
    expect(result.width).toBe(2);
    expect(state.writeF32).not.toHaveBeenCalled();
  });

  it("transcodes a striped DEM into a tiled COG entirely in memory with correct EPSG", async () => {
    const result = await prepareLocalGeoTiff(localFile());
    expect(result.converted).toBe(true);
    expect(result.file.name).toBe("maputo_dem.tif");
    expect(result.file.type).toBe("image/tiff");
    expect(state.setEpsg).toHaveBeenCalledWith(32736);
    expect(state.writeF32).toHaveBeenCalledWith(Float32Array.from([100, 120, 140, 160]));
    expect(state.readerFreed).toHaveBeenCalledOnce();
    expect(state.builderFreed).toHaveBeenCalledOnce();
  });

  it("refuses custom/unknown projections rather than silently corrupting the DEM", async () => {
    state.epsg = 32767;
    await expect(prepareLocalGeoTiff(localFile())).rejects.toThrow("CRS personalizado");
    expect(state.writeF32).not.toHaveBeenCalled();
    expect(state.builderFreed).toHaveBeenCalledOnce();
    expect(state.readerFreed).toHaveBeenCalledOnce();
  });

  it("rejects overly large decoded rasters before allocating samples", async () => {
    state.width = 10000;
    state.height = 10000;
    await expect(prepareLocalGeoTiff(localFile())).rejects.toThrow("limite seguro");
    expect(state.writeF32).not.toHaveBeenCalled();
  });

  it("rejects non-geotiff files", async () => {
    await expect(prepareLocalGeoTiff(new File(["junk"], "not-a-geotiff.png")))
      .rejects.toThrow("GeoTIFF");
  });
});

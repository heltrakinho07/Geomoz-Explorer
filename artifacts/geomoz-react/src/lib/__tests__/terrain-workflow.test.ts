// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import init, { CogBuilder, GeoTiffReader } from "geolibre-wasm";
import { initTools } from "geolibre-wasm/tools";
import { beforeAll, describe, expect, it } from "vitest";
import { executeTerrainWorkflow, DEFAULT_TERRAIN_OPTIONS, validateTerrainOptions, utmForBounds, intersectBounds } from "../terrain-workflow";

beforeAll(async () => {
  const entry = import.meta.resolve("geolibre-wasm");
  await init({ module_or_path: readFileSync(fileURLToPath(new URL("geolibre_wasm_bg.wasm", entry))) });
  await initTools(readFileSync(fileURLToPath(new URL("geolibre-cli.wasm", entry))));
}, 60_000);

function fixture(pit = false, nodata = false): Uint8Array {
  const size = 32;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = 1000 - x * 10 - y * 5;
  if (pit) data[16 * size + 16] -= 100;
  if (nodata) data.fill(-9999);
  const b = new CogBuilder(size, size, 1);
  try {
    b.set_epsg(32736); b.set_origin(500000, 7200000, 30); b.set_nodata(-9999);
    b.set_compression("deflate"); b.set_overview_levels(new Uint32Array());
    return b.write_f32(data);
  } finally { b.free(); }
}

describe("GeoLibre real DEM pipeline", () => {
  it("runs real terrain, depression filling, D8 accumulation, streams and basins", async () => {
    const events: string[] = [];
    const result = await executeTerrainWorkflow(fixture(true), "known-dem.tif", { ...DEFAULT_TERRAIN_OPTIONS, streamAreaKm2: 0.01 }, p => events.push(p.label));
    expect(result.products.map(p => p.id)).toEqual(["dem", "slope", "aspect", "hillshade", "filled", "direction", "accumulation", "streams", "basins"]);
    expect(result.report.engine).toBe("geolibre-wasm@1.6.0");
    expect(result.report.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.report.grid.epsg).toBe(32736);
    expect(events.at(-1)).toBe("Análise concluída");
    for (const product of result.products) {
      const reader = new GeoTiffReader(product.bytes);
      expect(reader.epsg).toBe(32736);
      expect(reader.width).toBe(result.report.grid.width);
      reader.free();
    }
    const accumulation = result.products.find(p => p.id === "accumulation")!;
    expect(accumulation.max).toBeGreaterThan(30);
    expect(accumulation.max).toBeLessThanOrEqual(result.products[0].validCells);
    expect(result.products.find(p => p.id === "streams")!.validCells).toBeGreaterThan(0);
    const directions = result.products.find(p => p.id === "direction")!;
    const r = new GeoTiffReader(directions.bytes);
    const codes = Array.from(r.read_band_f64(0)).filter(v => v !== r.nodata);
    r.free();
    expect(codes.every(v => [0,1,2,4,8,16,32,64,128].includes(v))).toBe(true);
  }, 60_000);
  it("matches analytical slope on a planar surface", async () => {
    const result = await executeTerrainWorkflow(fixture(), "plane.tif", { ...DEFAULT_TERRAIN_OPTIONS, hydrology: false });
    const slope = result.products.find(p => p.id === "slope")!;
    const r = new GeoTiffReader(slope.bytes);
    const values = r.read_band_f64(0);
    const actual = values[10 * r.width + 10];
    r.free();
    expect(actual).toBeCloseTo(Math.atan(Math.hypot(10,5) / 30) * 180 / Math.PI, 2);
  }, 60_000);
  it("rejects NoData-only and malformed input", async () => {
    await expect(executeTerrainWorkflow(fixture(false,true), "empty.tif", DEFAULT_TERRAIN_OPTIONS)).rejects.toThrow("NoData");
    await expect(executeTerrainWorkflow(new Uint8Array([1,2,3]), "bad.tif", DEFAULT_TERRAIN_OPTIONS)).rejects.toBeDefined();
  });
  it("validates grid parameters and AOI overlap", () => {
    expect(utmForBounds([32,-26,33,-25])).toBe(32736);
    expect(() => utmForBounds([-180,-80,180,80])).toThrow();
    expect(() => validateTerrainOptions({ ...DEFAULT_TERRAIN_OPTIONS, resolution: NaN })).toThrow();
    expect(() => intersectBounds([32,-26,33,-25], [40,-26,41,-25])).toThrow("não intersecta");
  });
});

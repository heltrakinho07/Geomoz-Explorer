import { describe, expect, it } from "vitest";
import { encodeGeoTiff, fitGcps, lonLatToTarget, targetToLonLat, transformedExtent,
  type Gcp } from "../georeferencing";

const pixelPoints: Array<[number, number]> = [
  [10, 10], [190, 10], [190, 90], [10, 90], [100, 50],
  [50, 35], [135, 65], [60, 80], [150, 20],
];
const points = (fn: (x: number, y: number) => { x: number; y: number }): Gcp[] =>
  pixelPoints.map(([px, py], i) => ({ id: String(i), px, py, ...fn(px, py) }));

describe("GeoMoz GCP transformation engine", () => {
  it("fits Helmert rotation+scale with near-zero pixel residuals", () => {
    const gcps = points((x, y) => ({ x: 430000 + 2 * x - 3 * y, y: 7120000 + 3 * x + 2 * y }));
    const model = fitGcps(gcps, 200, 100, "helmert");
    expect(model.rmsPixels).toBeLessThan(1e-6);
    const out = model.forward(44, 62);
    expect(out.x).toBeCloseTo(430000 + 2 * 44 - 3 * 62, 5);
    expect(out.y).toBeCloseTo(7120000 + 3 * 44 + 2 * 62, 5);
    const inverse = model.inverse(out.x, out.y);
    expect(inverse.x).toBeCloseTo(44, 4);
    expect(inverse.y).toBeCloseTo(62, 4);
  });
  it("fits first-order polynomial with shear", () => {
    const gcps = points((x, y) => ({ x: 35 + 0.001 * x + 0.0002 * y, y: -17 - 0.0006 * y + 0.0001 * x }));
    const transform = fitGcps(gcps, 200, 100, "affine");
    expect(transform.rmsPixels).toBeLessThan(1e-6);
    const target = transform.forward(43, 28);
    expect(target.x).toBeCloseTo(35 + 0.001 * 43 + 0.0002 * 28, 8);
    const back = transform.inverse(target.x, target.y);
    expect(back.x).toBeCloseTo(43, 4);
    expect(back.y).toBeCloseTo(28, 4);
  });
  it("fits second-order distortion with 6+ GCPs and computes extent", () => {
    const gcps = points((x, y) => ({
      x: 400000 + 4 * x + 0.003 * x * x + 0.001 * x * y,
      y: 7500000 - 4 * y + 0.002 * y * y + 0.001 * x * y,
    }));
    const fitted = fitGcps(gcps, 200, 100, "polynomial2");
    expect(fitted.rmsPixels).toBeLessThan(1e-5);
    const target = fitted.forward(110, 45);
    const inverse = fitted.inverse(target.x, target.y);
    expect(inverse.x).toBeCloseTo(110, 1);
    expect(inverse.y).toBeCloseTo(45, 1);
    const extent = transformedExtent(fitted, 200, 100);
    expect(extent.maxX).toBeGreaterThan(extent.minX);
    expect(extent.maxY).toBeGreaterThan(extent.minY);
  });
  it("rejects insufficient or collinear GCPs", () => {
    const gcps = points((x, y) => ({ x: x * 2, y: y * 3 }));
    expect(() => fitGcps(gcps.slice(0, 2), 200, 100, "affine")).toThrow(/3 GCPs/);
    const collinear = [0, 50, 100].map(i => ({ id: String(i), px: i, py: 50, x: i * 5, y: 200 }));
    expect(() => fitGcps(collinear, 200, 100, "affine")).toThrow(/alinhados/);
  });
  it("round-trips WGS84, Web Mercator and southern Mozambique UTM coordinates", () => {
    const longitude = 32.58, latitude = -25.97;
    for (const crs of [4326, 3857, 32735, 32736, 32737] as const) {
      const xy = lonLatToTarget(longitude, latitude, crs);
      const ll = targetToLonLat(xy.x, xy.y, crs);
      expect(ll.lon).toBeCloseTo(longitude, 4);
      expect(ll.lat).toBeCloseTo(latitude, 4);
    }
  });
  it("exports a valid TIFF IFD and GeoKey EPSG:32736", async () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
    const blob = encodeGeoTiff(rgba, 2, 2, { minX: 100, minY: 200, maxX: 120, maxY: 220 }, 32736);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(bytes[0]).toBe(73); expect(bytes[1]).toBe(73);
    expect(view.getUint16(2, true)).toBe(42);
    const count = view.getUint16(8, true);
    const tags = new Map<number, { type: number; count: number; value: number }>();
    for (let i = 0; i < count; i++) {
      const pos = 10 + 12 * i;
      tags.set(view.getUint16(pos, true), {
        type: view.getUint16(pos + 2, true), count: view.getUint32(pos + 4, true),
        value: view.getUint32(pos + 8, true),
      });
    }
    expect(tags.get(256)?.value).toBe(2);
    expect(tags.get(257)?.value).toBe(2);
    expect(tags.get(33550)?.count).toBe(3);
    expect(tags.get(33922)?.count).toBe(6);
    const key = tags.get(34735)!;
    expect(key.type).toBe(3);
    const keyValues = Array.from({ length: key.count }, (_, i) => view.getUint16(key.value + 2 * i, true));
    expect(keyValues).toContain(32736);
    const raster = tags.get(273)!.value;
    expect([...bytes.slice(raster, raster + rgba.length)]).toEqual([...rgba]);
  });
});

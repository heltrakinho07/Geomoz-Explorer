import type { GISWorkspaceRasterLayer } from "./gis-raster";
export type RasterStyle = Pick<GISWorkspaceRasterLayer, "rasterState" | "rasterSymbology">;
export type Bounds = [number, number, number, number];
export type Transform = [number, number, number, number, number, number];
export function invertPixel(gt: Transform, x: number, y: number): [number, number] {
  const det = gt[1] * gt[5] - gt[2] * gt[4];
  if (!Number.isFinite(det) || Math.abs(det) < Number.EPSILON * Math.max(Math.abs(gt[1]), Math.abs(gt[2]), Math.abs(gt[4]), Math.abs(gt[5])) ** 2 * 16)
    throw new Error("A grelha do raster não tem uma transformação afim válida.");
  return [((x - gt[0]) * gt[5] - (y - gt[3]) * gt[2]) / det,
    ((y - gt[3]) * gt[1] - (x - gt[0]) * gt[4]) / det];
}
const RAMPS: Record<string, string[]> = {
  viridis: ["#440154","#3b528b","#21918c","#5ec962","#fde725"],
  terrain: ["#174a7e","#2f8f6b","#a8b95d","#b48555","#f5f5f5"],
  turbo: ["#30123b","#466be3","#22b5a9","#a4fc3c","#f9ba38","#e43b1f"],
  magma: ["#000004","#3b0f70","#8c2981","#de4968","#fe9f6d","#fcfdbf"],
  plasma: ["#0d0887","#6a00a8","#b12a90","#e16462","#fca636","#f0f921"],
  gray: ["#111827","#f8fafc"], blues: ["#eff6ff","#60a5fa","#1e3a8a"],
};
function rgb(color: string): number[] {
  const hex = color.replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? [...hex].map(c=>c+c).join("") : hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rampColor(ramp: string[], t: number): number[] {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1), i = Math.floor(x);
  const a = rgb(ramp[i]), b = rgb(ramp[Math.min(i + 1, ramp.length - 1)]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * (x - i)));
}
export function rasterColor(value: number, range: [number, number], style: RasterStyle): number[] {
  const s = style.rasterState ?? {}, sym = style.rasterSymbology;
  if (sym?.classified && sym.breaks.length >= 2) {
    const n = sym.breaks.length - 1;
    let i = sym.breaks.findIndex((b, j) => j > 0 && value < b) - 1;
    if (i < 0) i = value < sym.breaks[0] ? 0 : n - 1;
    if (s.reversed) i = n - 1 - i;
    const colors = sym.customColors && sym.customColors.length >= 2 ? sym.customColors : RAMPS[sym.ramp] ?? RAMPS.viridis;
    return rampColor(colors, n === 1 ? 0 : i / (n - 1));
  }
  let t = stretchValue(value, range, s.stretch, s.gamma);
  if (s.reversed) t = 1 - t;
  return rampColor(RAMPS[s.colormap ?? "viridis"] ?? RAMPS.viridis, t);
}
export function stretchValue(value: number, range: [number, number], stretch?: string, gamma = 1): number {
  let t = range[1] === range[0] ? 0.5 : Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
  if (stretch === "sqrt") t = Math.sqrt(t);
  if (stretch === "log") t = Math.log1p(9 * t) / Math.log(10);
  return Math.pow(t, 1 / (Number.isFinite(gamma) && gamma > 0 ? gamma : 1));
}
export function rasterNoData(value: number, nodata: number | null, setting: unknown): boolean {
  return !Number.isFinite(value) || (setting !== "off" && value === (typeof setting === "number" ? setting : nodata));
}

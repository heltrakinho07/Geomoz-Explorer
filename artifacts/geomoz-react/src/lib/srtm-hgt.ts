import type { Bounds } from "./terrain-workflow";

export function hgtMetadata(name: string, byteLength: number) {
  const match = /^([NS])(\d{2})([EW])(\d{3})\.hgt$/i.exec(name.split(/[\\/]/).at(-1) ?? "");
  if (!match) throw new Error("Mantenha o nome SRTM original, por exemplo S20E035.hgt, para localizar o DEM.");
  const side = Math.sqrt(byteLength / 2);
  if (side !== 1201 && side !== 3601) throw new Error("HGT inválido: esperadas grelhas SRTM de 1201 × 1201 ou 3601 × 3601 amostras. Descomprima o ficheiro .hgt antes de importar.");
  const south = Number(match[2]) * (match[1].toUpperCase() === "S" ? -1 : 1);
  const west = Number(match[4]) * (match[3].toUpperCase() === "W" ? -1 : 1);
  if (south < -90 || south >= 90 || west < -180 || west >= 180) throw new Error("Coordenadas inválidas no nome HGT.");
  return {side, west, south, step: 1 / (side - 1), bounds: [west, south, west + 1, south + 1] as Bounds};
}

/** SRTM: signed int16 big-endian, heights in metres, rows north to south. */
export async function hgtToGeoTiff(bytes: Uint8Array, name: string, bbox?: Bounds): Promise<Uint8Array> {
  const {side, west, south, step} = hgtMetadata(name, bytes.length);
  const minX = Math.max(west, bbox?.[0] ?? west), maxX = Math.min(west + 1, bbox?.[2] ?? west + 1);
  const minY = Math.max(south, bbox?.[1] ?? south), maxY = Math.min(south + 1, bbox?.[3] ?? south + 1);
  if (minX >= maxX || minY >= maxY) throw new Error("O DEM HGT não intersecta a área seleccionada.");
  const x0 = Math.max(0, Math.floor((minX - west) / step) - 1);
  const y0 = Math.max(0, Math.floor((south + 1 - maxY) / step) - 1);
  const x1 = Math.min(side - 1, Math.ceil((maxX - west) / step) + 1);
  const y1 = Math.min(side - 1, Math.ceil((south + 1 - minY) / step) + 1);
  const width = x1 - x0 + 1, height = y1 - y0 + 1;
  const values = new Float32Array(width * height);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) values[y * width + x] = view.getInt16(((y0 + y) * side + x0 + x) * 2, false);
  const lib = await import("geolibre-wasm"); await lib.default();
  const builder = new lib.CogBuilder(width, height, 1);
  try {
    builder.set_epsg(4326); builder.set_nodata(-32768); builder.set_compression("deflate");
    builder.set_tile_size(512); builder.set_overview_levels(new Uint32Array());
    builder.set_geo_transform(new Float64Array([west + x0 * step - step / 2, step, 0, south + 1 - y0 * step + step / 2, 0, -step]));
    return builder.write_f32(values);
  } finally { builder.free(); }
}

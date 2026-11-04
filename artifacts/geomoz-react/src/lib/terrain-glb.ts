/**
 * GeoMoz portable glTF 2.0 binary exporter.
 *
 * The scene is expressed in local metres (X east, Y up, Z north) around the
 * DEM footprint centre; CRS/geographic placement is preserved in glTF extras.
 * NoData triangles are omitted, never flattened or bridged.
 * Produces a self-contained GLB, optionally embedding a PNG/JPEG orthophoto.
 */
import type { TerrainMeshData } from "./terrain-webgl";

export interface TerrainGLBTexture {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
}

const ENCODER = new TextEncoder();
const MAX_GRID = 257;
const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;

function pad4(n: number): number {
  return (n + 3) & ~3;
}
function numbers3(buffer: ArrayBuffer, values: readonly number[]): void {
  const view = new DataView(buffer);
  values.forEach((n, i) => view.setFloat32(i * 4, n, true));
}
function floats(values: readonly number[]): Uint8Array {
  const buffer = new ArrayBuffer(values.length * 4);
  numbers3(buffer, values);
  return new Uint8Array(buffer);
}
function shorts(values: readonly number[]): Uint8Array {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  values.forEach((n, i) => view.setUint16(i * 2, n, true));
  return new Uint8Array(buffer);
}
function downAngle(
  h: readonly (number | null)[],
  row: number,
  col: number,
  width: number,
  height: number,
  spacingX: number,
  spacingY: number,
  exaggeration: number
): [number, number, number] {
  const value = (r: number, c: number) => h[r * width + c];
  const center = value(row, col) ?? 0;
  const west = value(row, Math.max(0, col - 1)) ?? center;
  const east = value(row, Math.min(width - 1, col + 1)) ?? center;
  const north = value(Math.max(0, row - 1), col) ?? center;
  const south = value(Math.min(height - 1, row + 1), col) ?? center;
  const dzdx = (east - west) * exaggeration /
    Math.max(spacingX * (col === 0 || col === width - 1 ? 1 : 2), 1e-8);
  const dzdz = (north - south) * exaggeration /
    Math.max(spacingY * (row === 0 || row === height - 1 ? 1 : 2), 1e-8);
  const length = Math.hypot(dzdx, 1, dzdz);
  return [-dzdx / length, 1 / length, -dzdz / length];
}
function colour(t: number, greyscale: boolean): number[] {
  if (greyscale) {
    const c = Math.round(65 + Math.max(0, Math.min(1, t)) * 180);
    return [c, c, c, 255];
  }
  // Terrain hypsometric approximation used for a portable, untextured mesh.
  const stops = [
    [30, 98, 75], [110, 156, 84], [181, 166, 113],
    [159, 131, 99], [235, 232, 217]
  ];
  const scaled = Math.max(0, Math.min(0.99999, t)) * (stops.length - 1);
  const i = Math.floor(scaled);
  return [...stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * (scaled - i))), 255];
}
function validate(mesh: TerrainMeshData, exaggeration: number): void {
  const { width, height } = mesh;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
      width > MAX_GRID || height > MAX_GRID || width * height > 65_535 ||
      mesh.heights.length !== width * height ||
      !Array.isArray(mesh.boundsMeters) || mesh.boundsMeters.length !== 4 ||
      mesh.boundsMeters.some(v => !Number.isFinite(v)) ||
      mesh.boundsMeters[2] <= mesh.boundsMeters[0] ||
      mesh.boundsMeters[3] <= mesh.boundsMeters[1] ||
      !Number.isFinite(mesh.minElevation) || !Number.isFinite(mesh.maxElevation) ||
      !Number.isFinite(exaggeration) || exaggeration < 1 || exaggeration > 15 ||
      mesh.heights.some(h => h !== null && !Number.isFinite(h))) {
    throw new Error("Malha ou exagero vertical inválidos para exportação GLB.");
  }
}

/** glTF 2.0 GLB. Cores por altitude, ou textura RGB georreferenciada embebida. */
export function encodeTerrainGLB(
  mesh: TerrainMeshData,
  exaggeration: number,
  style: "hypsometric" | "grayscale" | "imagery",
  texture?: TerrainGLBTexture | null
): Uint8Array {
  validate(mesh, exaggeration);
  if (texture && (!texture.bytes.length || texture.bytes.length > MAX_TEXTURE_BYTES ||
      !["image/png", "image/jpeg"].includes(texture.mimeType))) {
    throw new Error("Textura GLB inválida ou demasiado grande.");
  }
  const { width, height } = mesh;
  const [left, bottom, right, top] = mesh.boundsMeters;
  const spanX = right - left, spanZ = top - bottom;
  const dx = spanX / (width - 1), dz = spanZ / (height - 1);
  const spanHeight = Math.max(mesh.maxElevation - mesh.minElevation, 1);
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  const rgba: number[] = [], indices: number[] = [];
  let validVertices = 0;
  let highest = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const h = mesh.heights[i];
      if (h !== null) validVertices++;
      const y = (h === null ? mesh.minElevation : h) - mesh.minElevation;
      highest = Math.max(highest, y * exaggeration);
      positions.push((col / (width - 1) - 0.5) * spanX, y * exaggeration,
        (0.5 - row / (height - 1)) * spanZ);
      normals.push(...downAngle(mesh.heights, row, col, width, height, dx, dz, exaggeration));
      uv.push(col / (width - 1), row / (height - 1));
      rgba.push(...colour(y / spanHeight, style === "grayscale"));
    }
  }
  const valid = (i: number) => mesh.heights[i] !== null;
  for (let r = 0; r < height - 1; r++) for (let c = 0; c < width - 1; c++) {
    const a = r * width + c, b = a + 1, d = a + width, e = d + 1;
    if (valid(a) && valid(b) && valid(d)) indices.push(a, d, b);
    if (valid(b) && valid(d) && valid(e)) indices.push(b, d, e);
  }
  if (!indices.length) throw new Error("DEM sem triângulos válidos para GLB.");

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const views: object[] = [];
  function add(bytes: Uint8Array, target?: number): number {
    const padded = new Uint8Array(pad4(bytes.length));
    padded.set(bytes);
    chunks.push(padded);
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length,
      ...(target !== undefined ? { target } : {}) };
    const index = views.push(view) - 1;
    offset += padded.length;
    return index;
  }
  const positionView = add(floats(positions), 34962);
  const normalView = add(floats(normals), 34962);
  const uvView = add(floats(uv), 34962);
  const colourView = add(new Uint8Array(rgba), 34962);
  const indexView = add(shorts(indices), 34963);
  const count = width * height;
  const accessors = [
    { bufferView: positionView, componentType: 5126, count, type: "VEC3",
      min: [-spanX / 2, 0, -spanZ / 2], max: [spanX / 2, highest, spanZ / 2] },
    { bufferView: normalView, componentType: 5126, count, type: "VEC3" },
    { bufferView: uvView, componentType: 5126, count, type: "VEC2" },
    { bufferView: colourView, componentType: 5121, count, type: "VEC4", normalized: true },
    { bufferView: indexView, componentType: 5123, count: indices.length, type: "SCALAR",
      min: [Math.min(...indices)], max: [Math.max(...indices)] }
  ];
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0", generator: "GeoMoz 3D Terrain Studio" },
    scene: 0,
    scenes: [{ nodes: [0], name: mesh.name }],
    nodes: [{ mesh: 0, name: mesh.name }],
    meshes: [{
      name: "Modelo do terreno (metros)",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2,
          ...(texture ? {} : { COLOR_0: 3 }) },
        indices: 4, material: 0
      }]
    }],
    materials: [{ name: "GeoMoz Terrain",
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true }],
    buffers: [{ byteLength: 0 }],
    bufferViews: views, accessors,
    extras: {
      sourceName: mesh.name,
      sourceCrs: mesh.sourceCrs,
      workingCrs: mesh.crs,
      boundsMeters: mesh.boundsMeters,
      bounds4326: mesh.bounds4326,
      elevationOriginMeters: mesh.minElevation,
      verticalExaggeration: exaggeration,
      validVertices,
      triangleCount: indices.length / 3,
      note: "Preview mesh: not source DEM resolution; positions use local metre coordinates."
    }
  };
  if (texture) {
    const imageView = add(texture.bytes);
    gltf.images = [{ bufferView: imageView, mimeType: texture.mimeType }];
    gltf.samplers = [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }];
    gltf.textures = [{ source: 0, sampler: 0 }];
    const material = (gltf.materials as Record<string, unknown>[])[0];
    (material.pbrMetallicRoughness as Record<string, unknown>).baseColorTexture = { index: 0 };
    material.alphaMode = "BLEND";
  }
  (gltf.buffers as { byteLength: number }[])[0].byteLength = offset;
  const jsonBytes = ENCODER.encode(JSON.stringify(gltf));
  const jsonLen = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonLen + 8 + offset;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // glTF
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  const binOffset = 20 + jsonLen;
  view.setUint32(binOffset, offset, true);
  view.setUint32(binOffset + 4, 0x004e4942, true); // BIN\0
  let cursor = binOffset + 8;
  for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.length; }
  return out;
}

/** Normalize any browser-supported satellite image to core glTF PNG. */
export async function imageToGLBTexture(url: string): Promise<TerrainGLBTexture> {
  if (!url.startsWith("blob:") && !url.startsWith("data:image/")) {
    throw new Error("A textura GLB deve ter origem local ao projecto GeoMoz.");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível ler a textura.");
  const blob = await response.blob();
  if (blob.size > MAX_TEXTURE_BYTES) throw new Error("Textura demasiado grande para GLB (8 MB).");
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    if (canvas.width < 1 || canvas.height < 1 || canvas.width > 4096 ||
        canvas.height > 4096) throw new Error("Dimensões da textura não suportadas.");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D indisponível.");
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(v => v ? resolve(v) : reject(new Error("PNG da textura indisponível.")), "image/png"));
    const bytes = new Uint8Array(await png.arrayBuffer());
    if (bytes.length > MAX_TEXTURE_BYTES) throw new Error("Textura PNG demasiado grande.");
    return { bytes, mimeType: "image/png" };
  } finally {
    bitmap.close();
  }
}

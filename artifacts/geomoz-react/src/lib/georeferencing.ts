/**
 * GeoMoz — georreferenciação 100% local. Nenhum GCP nem imagem sai do navegador.
 * Ajuste por mínimos quadrados (QR) com coordenadas normalizadas, reprojecção
 * WGS84/UTM ou Web Mercator e exportação GeoTIFF TIFF 6.0/GeoKeys OGC.
 */
export type TargetCrs = 4326 | 3857 | 32735 | 32736 | 32737;
export type TransformMethod = "helmert" | "affine" | "polynomial2";
export type Resampling = "nearest" | "bilinear";
export type Gcp = { id: string; px: number; py: number; x: number; y: number };
export type ControlResidual = { id: string; pixelError: number; worldError: number };
export type XY = { x: number; y: number };
export type Extent = { minX: number; minY: number; maxX: number; maxY: number };
export const MIN_GCPS: Record<TransformMethod, number> = { helmert: 2, affine: 3, polynomial2: 6 };

const rad = Math.PI / 180;
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);

export function lonLatToTarget(lon: number, lat: number, crs: TargetCrs): XY {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error("Longitude ou latitude inválida.");
  }
  if (crs === 4326) return { x: lon, y: lat };
  if (crs === 3857) {
    if (Math.abs(lat) > 85.05112878) throw new Error("Latitude fora da cobertura Web Mercator.");
    return { x: A * lon * rad, y: A * Math.log(Math.tan(Math.PI / 4 + lat * rad / 2)) };
  }
  const zone = crs - 32700;
  const phi = lat * rad, lambda = (lon - (zone * 6 - 183)) * rad;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * sin * sin), t = tan * tan, c = EP2 * cos * cos, aa = cos * lambda;
  const m = A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
  const x = 500000 + 0.9996 * n * (aa + (1 - t + c) * aa ** 3 / 6
    + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * aa ** 5 / 120);
  const north = 0.9996 * (m + n * tan * (aa * aa / 2
    + (5 - t + 9 * c + 4 * c * c) * aa ** 4 / 24
    + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * aa ** 6 / 720));
  return { x, y: north + (lat < 0 ? 10000000 : 0) };
}

export function targetToLonLat(x: number, y: number, crs: TargetCrs): { lon: number; lat: number } {
  if (crs === 4326) return { lon: x, lat: y };
  if (crs === 3857) return { lon: x / A / rad, lat: (2 * Math.atan(Math.exp(y / A)) - Math.PI / 2) / rad };
  const zone = crs - 32700, k = 0.9996;
  const m = (y - 10000000) / k;
  const mu = m / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * sin * sin), t = tan ** 2, c = EP2 * cos * cos;
  const r = A * (1 - E2) / (1 - E2 * sin * sin) ** 1.5;
  const d = (x - 500000) / (n * k);
  const lat = (phi - n * tan / r * (d ** 2 / 2
    - (5 + 3 * t + 10 * c - 4 * c * c - 9 * EP2) * d ** 4 / 24
    + (61 + 90 * t + 298 * c + 45 * t * t - 252 * EP2 - 3 * c * c) * d ** 6 / 720)) / rad;
  const lon = zone * 6 - 183 + (d - (1 + 2 * t + c) * d ** 3 / 6
    + (5 - 2 * c + 28 * t - 3 * c * c + 8 * EP2 + 24 * t * t) * d ** 5 / 120) / cos / rad;
  return { lon, lat };
}

function solveLeastSquares(rows: number[][], values: number[], count: number): number[] {
  const n = rows.length;
  if (n < count) throw new Error("Pontos de controlo insuficientes.");
  const q: number[][] = [], r: number[][] = Array.from({ length: count }, () => Array(count).fill(0));
  for (let j = 0; j < count; j++) {
    const v = rows.map(row => row[j]);
    const originalNorm = Math.hypot(...v);
    for (let k = 0; k < j; k++) {
      const projection = q[k].reduce((sum, item, i) => sum + item * v[i], 0);
      r[k][j] = projection;
      for (let i = 0; i < n; i++) v[i] -= projection * q[k][i];
    }
    const norm = Math.hypot(...v);
    if (norm < 1e-9 * Math.max(1, originalNorm)) {
      throw new Error("GCPs degenerados ou alinhados. Distribua os pontos pela imagem.");
    }
    r[j][j] = norm;
    q[j] = v.map(item => item / norm);
  }
  const b = q.map(col => col.reduce((sum, item, i) => sum + item * values[i], 0));
  const answer = Array(count).fill(0);
  for (let i = count - 1; i >= 0; i--) {
    let value = b[i];
    for (let j = i + 1; j < count; j++) value -= r[i][j] * answer[j];
    answer[i] = value / r[i][i];
  }
  return answer;
}

export type FittedTransform = {
  method: TransformMethod;
  rmsPixels: number;
  residuals: ControlResidual[];
  forward: (px: number, py: number) => XY;
  inverse: (x: number, y: number) => XY;
  jacobian: (px: number, py: number) => [number, number, number, number];
};

export function fitGcps(gcps: Gcp[], width: number, height: number, method: TransformMethod): FittedTransform {
  if (gcps.length < MIN_GCPS[method]) throw new Error("São necessários pelo menos " + MIN_GCPS[method] + " GCPs.");
  if (width <= 0 || height <= 0) throw new Error("Dimensões da imagem inválidas.");
  if (gcps.some(p => ![p.px, p.py, p.x, p.y].every(Number.isFinite))) throw new Error("Coordenadas de GCP inválidas.");
  const dimension = Math.max(width, height);
  const cx = gcps.reduce((sum, p) => sum + p.x, 0) / gcps.length;
  const cy = gcps.reduce((sum, p) => sum + p.y, 0) / gcps.length;
  const worldScale = Math.max(...gcps.map(p => Math.hypot(p.x - cx, p.y - cy)), 1e-8);
  const normalized = gcps.map(p => ({ u: (p.px - width / 2) / dimension, v: (p.py - height / 2) / dimension,
    x: (p.x - cx) / worldScale, y: (p.y - cy) / worldScale }));
  const terms = (u: number, v: number): number[] => method === "affine"
    ? [1, u, v] : [1, u, v, u * u, u * v, v * v];
  let ax: number[], ay: number[];
  if (method === "helmert") {
    const rows: number[][] = [], values: number[] = [];
    normalized.forEach(p => {
      rows.push([1, 0, p.u, -p.v], [0, 1, p.v, p.u]);
      values.push(p.x, p.y);
    });
    const h = solveLeastSquares(rows, values, 4);
    ax = [h[0], h[2], -h[3]];
    ay = [h[1], h[3], h[2]];
  } else {
    const rows = normalized.map(p => terms(p.u, p.v));
    const size = method === "affine" ? 3 : 6;
    ax = solveLeastSquares(rows, normalized.map(p => p.x), size);
    ay = solveLeastSquares(rows, normalized.map(p => p.y), size);
  }
  const forward = (px: number, py: number): XY => {
    const basis = method === "helmert" ? [1, (px - width / 2) / dimension, (py - height / 2) / dimension]
      : terms((px - width / 2) / dimension, (py - height / 2) / dimension);
    const evaluate = (coefficients: number[]) => coefficients.reduce((sum, a, i) => sum + a * basis[i], 0);
    return { x: cx + worldScale * evaluate(ax), y: cy + worldScale * evaluate(ay) };
  };
  const jacobian = (px: number, py: number): [number, number, number, number] => {
    const u = (px - width / 2) / dimension, v = (py - height / 2) / dimension;
    const derivative = (a: number[]) => method === "polynomial2"
      ? [(a[1] + 2 * a[3] * u + a[4] * v) * worldScale / dimension,
        (a[2] + a[4] * u + 2 * a[5] * v) * worldScale / dimension]
      : [a[1] * worldScale / dimension, a[2] * worldScale / dimension];
    const dx = derivative(ax), dy = derivative(ay);
    return [dx[0], dx[1], dy[0], dy[1]];
  };
  const inverse = (x: number, y: number): XY => {
    let px = width / 2, py = height / 2;
    for (let iteration = 0; iteration < 15; iteration++) {
      const f = forward(px, py);
      const [a, b, c, d] = jacobian(px, py);
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-22 || !Number.isFinite(det)) return { x: NaN, y: NaN };
      const dx = x - f.x, dy = y - f.y;
      const stepX = (d * dx - b * dy) / det;
      const stepY = (-c * dx + a * dy) / det;
      px += stepX; py += stepY;
      if (!Number.isFinite(px) || !Number.isFinite(py)) return { x: NaN, y: NaN };
      if (Math.hypot(stepX, stepY) < 1e-4) break;
    }
    const result = forward(px, py);
    const [a, b, c, d] = jacobian(px, py);
    const err = Math.hypot(result.x - x, result.y - y);
    const scale = Math.max(Math.hypot(a, c), Math.hypot(b, d), 1e-12);
    if (err / scale > 0.5) return { x: NaN, y: NaN };
    return { x: px, y: py };
  };
  const residuals: ControlResidual[] = gcps.map(p => {
    const prediction = forward(p.px, p.py);
    const dx = prediction.x - p.x, dy = prediction.y - p.y;
    const [a, b, c, d] = jacobian(p.px, p.py), det = a * d - b * c;
    const pixelError = Math.abs(det) > 1e-22
      ? Math.hypot((d * dx - b * dy) / det, (-c * dx + a * dy) / det) : Infinity;
    return { id: p.id, pixelError, worldError: Math.hypot(dx, dy) };
  });
  const rmsPixels = Math.sqrt(residuals.reduce((sum, p) => sum + p.pixelError ** 2, 0) / residuals.length);
  if (!Number.isFinite(rmsPixels)) throw new Error("A transformação é instável: reveja os GCPs.");
  return { method, forward, inverse, jacobian, residuals, rmsPixels };
}

export function transformedExtent(transform: FittedTransform, width: number, height: number): Extent {
  const locations: XY[] = [];
  let sign = 0;
  for (let iy = 0; iy <= 12; iy++) {
    for (let ix = 0; ix <= 12; ix++) {
      const px = width * ix / 12, py = height * iy / 12;
      locations.push(transform.forward(px, py));
      const [a, b, c, d] = transform.jacobian(px, py);
      const determinant = a * d - b * c;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-22) {
        throw new Error("A transformação dobra ou colapsa a imagem. Corrija os GCPs.");
      }
      if (sign && Math.sign(determinant) !== sign) {
        throw new Error("A transformação dobra a imagem. Corrija os GCPs ou escolha Polinomial 1.");
      }
      sign = Math.sign(determinant);
    }
  }
  const allX = locations.map(p => p.x), allY = locations.map(p => p.y);
  const box = { minX: Math.min(...allX), maxX: Math.max(...allX), minY: Math.min(...allY), maxY: Math.max(...allY) };
  if (![box.minX, box.maxX, box.minY, box.maxY].every(Number.isFinite) || box.maxX <= box.minX || box.maxY <= box.minY) {
    throw new Error("Extensão de saída inválida.");
  }
  return box;
}

/** GeoTIFF RGB + alpha, 8-bit, sem compressão, north-up e PixelIsArea. */
export function encodeGeoTiff(rgba: Uint8ClampedArray, width: number, height: number, extent: Extent, crs: TargetCrs): Blob {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new Error("Raster RGB(A) inválido.");
  }
  type Tag = { id: number; type: number; count: number; data: number[] };
  const scalar = (id: number, type: number, val: number): Tag => ({ id, type, count: 1, data: [val] });
  const list = (id: number, type: number, arr: number[]): Tag => ({ id, type, count: arr.length, data: arr });
  const keys = crs === 4326
    ? [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]
    : [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, crs];
  const tags: Tag[] = [
    scalar(256, 4, width), scalar(257, 4, height), list(258, 3, [8, 8, 8, 8]),
    scalar(259, 3, 1), scalar(262, 3, 2), scalar(273, 4, 0),
    scalar(277, 3, 4), scalar(278, 4, height), scalar(279, 4, rgba.length),
    scalar(284, 3, 1), scalar(338, 3, 2),
    list(33550, 12, [(extent.maxX - extent.minX) / width, (extent.maxY - extent.minY) / height, 0]),
    list(33922, 12, [0, 0, 0, extent.minX, extent.maxY, 0]),
    list(34735, 3, keys),
  ].sort((a, b) => a.id - b.id);
  const sizeOf = (type: number) => type === 3 ? 2 : type === 12 ? 8 : 4;
  const align = (n: number, multiple: number) => Math.ceil(n / multiple) * multiple;
  let offset = align(8 + 2 + tags.length * 12 + 4, 8);
  const external = new Map<number, number>();
  for (const tag of tags) {
    const bytes = tag.count * sizeOf(tag.type);
    if (bytes > 4) {
      offset = align(offset, tag.type === 12 ? 8 : 2);
      external.set(tag.id, offset);
      offset += bytes;
    }
  }
  const rasterOffset = align(offset, 4);
  tags.find(tag => tag.id === 273)!.data = [rasterOffset];
  const buffer = new ArrayBuffer(rasterOffset + rgba.byteLength), view = new DataView(buffer);
  view.setUint8(0, 73); view.setUint8(1, 73); view.setUint16(2, 42, true); view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  const writeValue = (tag: Tag, position: number) => {
    const step = sizeOf(tag.type);
    tag.data.forEach((value, i) => {
      const index = position + i * step;
      if (tag.type === 3) view.setUint16(index, value, true);
      else if (tag.type === 12) view.setFloat64(index, value, true);
      else view.setUint32(index, value, true);
    });
  };
  tags.forEach((tag, index) => {
    const p = 10 + index * 12, externalAt = external.get(tag.id);
    view.setUint16(p, tag.id, true); view.setUint16(p + 2, tag.type, true);
    view.setUint32(p + 4, tag.count, true);
    if (externalAt !== undefined) {
      view.setUint32(p + 8, externalAt, true);
      writeValue(tag, externalAt);
    } else writeValue(tag, p + 8);
  });
  view.setUint32(10 + tags.length * 12, 0, true);
  new Uint8Array(buffer, rasterOffset).set(rgba);
  return new Blob([buffer], { type: "image/tiff" });
}

export type GeoreferenceOutput = {
  geotiff: Blob;
  preview: Blob;
  extent: Extent;
  width: number;
  height: number;
  rmsPixels: number;
};

/** Faz a rectificação real (inverse mapping), cria GeoTIFF e PNG de visualização. */
export async function georeferenceImage(
  file: File, gcps: Gcp[], method: TransformMethod, crs: TargetCrs, resampling: Resampling,
): Promise<GeoreferenceOutput> {
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 32_000_000) throw new Error("Imagem demasiado grande (máximo 32 megapíxeis).");
    const fitted = fitGcps(gcps, image.width, image.height, method);
    const extent = transformedExtent(fitted, image.width, image.height);
    const [a, b, c, d] = fitted.jacobian(image.width / 2, image.height / 2);
    const resolution = (Math.hypot(a, c) + Math.hypot(b, d)) / 2;
    if (!Number.isFinite(resolution) || resolution <= 0) throw new Error("Resolução calculada inválida.");
    const desiredWidth = (extent.maxX - extent.minX) / resolution;
    const desiredHeight = (extent.maxY - extent.minY) / resolution;
    const shrink = Math.min(1, 2800 / Math.max(desiredWidth, desiredHeight), Math.sqrt(6_000_000 / (desiredWidth * desiredHeight)));
    const width = Math.max(1, Math.ceil(desiredWidth * shrink));
    const height = Math.max(1, Math.ceil(desiredHeight * shrink));
    if (!Number.isFinite(width * height) || width * height > 6_100_000) throw new Error("Dimensões de saída excessivas.");
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.width; sourceCanvas.height = image.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("Canvas de entrada indisponível.");
    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, image.width, image.height).data;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width; outputCanvas.height = height;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("Canvas de saída indisponível.");
    const output = outputContext.createImageData(width, height);
    const pw = (extent.maxX - extent.minX) / width, ph = (extent.maxY - extent.minY) / height;
    const sw = image.width, sh = image.height;
    for (let row = 0; row < height; row++) {
      const y = extent.maxY - (row + 0.5) * ph;
      for (let col = 0; col < width; col++) {
        const x = extent.minX + (col + 0.5) * pw;
        const src = fitted.inverse(x, y);
        if (!Number.isFinite(src.x) || !Number.isFinite(src.y) || src.x < 0 || src.x >= sw || src.y < 0 || src.y >= sh) continue;
        const out = (row * width + col) * 4;
        if (resampling === "nearest") {
          const at = (Math.floor(src.y) * sw + Math.floor(src.x)) * 4;
          for (let band = 0; band < 4; band++) output.data[out + band] = pixels[at + band];
        } else {
          const fx = Math.max(0, Math.min(sw - 1, src.x - 0.5)), fy = Math.max(0, Math.min(sh - 1, src.y - 0.5));
          const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
          const tx = fx - x0, ty = fy - y0;
          const inds = [(y0 * sw + x0) * 4, (y0 * sw + x1) * 4, (y1 * sw + x0) * 4, (y1 * sw + x1) * 4];
          const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
          // Interpolação em cores pré-multiplicadas, evitando halos transparentes.
          let alpha = 0;
          for (let i = 0; i < 4; i++) alpha += ws[i] * pixels[inds[i] + 3] / 255;
          output.data[out + 3] = Math.round(alpha * 255);
          for (let band = 0; band < 3; band++) {
            let channel = 0;
            for (let i = 0; i < 4; i++) channel += ws[i] * pixels[inds[i] + band] * pixels[inds[i] + 3] / 255;
            output.data[out + band] = alpha ? Math.round(channel / alpha) : 0;
          }
        }
      }
    }
    outputContext.putImageData(output, 0, 0);
    const preview = await new Promise<Blob>((resolve, reject) => outputCanvas.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error("Não foi possível gerar a pré-visualização.")), "image/png"));
    return { geotiff: encodeGeoTiff(output.data, width, height, extent, crs), preview, extent, width, height,
      rmsPixels: fitted.rmsPixels };
  } finally {
    image.close();
  }
}

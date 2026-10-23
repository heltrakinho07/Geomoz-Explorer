/** GeoMoz: coordenadas UTM/WGS84 e qualidade GCP, para o motor georreferenciador nativo. */
import type { Affine, GCP } from "./georeference";

export type GeoMozGeorefCrs = "EPSG:4326" | "EPSG:3857" | "EPSG:32735" | "EPSG:32736" | "EPSG:32737";

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const RAD = Math.PI / 180;

/** Converte coordenadas introduzidas no SRC seleccionado para GCPs WGS84. */
export function geomozProjectedToGeographic(x: number, y: number, src: GeoMozGeorefCrs): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Coordenadas X/Y inválidas.");
  let longitude = x, latitude = y;
  if (src === "EPSG:3857") {
    longitude = x / A / RAD;
    latitude = (2 * Math.atan(Math.exp(y / A)) - Math.PI / 2) / RAD;
  } else if (src.startsWith("EPSG:327")) {
    // Conversão inversa Transverse Mercator para UTM, hemisfério sul, WGS 84.
    const zone = Number(src.slice(-2));
    if (x < 100000 || x > 900000 || y < 0 || y > 10000000) {
      throw new Error("Este/Norte fora do intervalo UTM. Verifique a zona e as coordenadas.");
    }
    const k0 = 0.9996;
    const m = (y - 10000000) / k0;
    const mu = m / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const fp = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
      + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const sin = Math.sin(fp), cos = Math.cos(fp), tan = Math.tan(fp);
    const n = A / Math.sqrt(1 - E2 * sin * sin);
    const t = tan * tan, c = EP2 * cos * cos;
    const r = A * (1 - E2) / (1 - E2 * sin * sin) ** 1.5;
    const d = (x - 500000) / (n * k0);
    latitude = (fp - n * tan / r * (d * d / 2
      - (5 + 3 * t + 10 * c - 4 * c * c - 9 * EP2) * d ** 4 / 24
      + (61 + 90 * t + 298 * c + 45 * t * t - 252 * EP2 - 3 * c * c) * d ** 6 / 720)) / RAD;
    longitude = zone * 6 - 183 + (d - (1 + 2 * t + c) * d ** 3 / 6
      + (5 - 2 * c + 28 * t - 3 * c * c + 8 * EP2 + 24 * t * t) * d ** 5 / 120) / cos / RAD;
    if (latitude > 0.1 || latitude < -80.1) {
      throw new Error("Coordenadas incompatíveis com UTM Sul.");
    }
  }
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
    throw new Error("Coordenadas geográficas fora dos limites.");
  }
  return [longitude, latitude];
}

/** Erros espaciais reconvertidos para pixels da imagem (não metros do mapa). */
export function geomozGcpPixelResiduals(affine: Affine, gcps: GCP[]): {
  perPoint: number[]; rms: number;
} {
  const det = affine.a * affine.e - affine.b * affine.d;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return { perPoint: gcps.map(() => Infinity), rms: Infinity };
  const perPoint = gcps.map(g => {
    const deltaX = affine.a * g.px + affine.b * g.py + affine.c - g.lng;
    const deltaY = affine.d * g.px + affine.e * g.py + affine.f - g.lat;
    const dx = (affine.e * deltaX - affine.b * deltaY) / det;
    const dy = (-affine.d * deltaX + affine.a * deltaY) / det;
    return Math.hypot(dx, dy);
  });
  return { perPoint, rms: Math.sqrt(perPoint.reduce((s, v) => s + v * v, 0) / (perPoint.length || 1)) };
}

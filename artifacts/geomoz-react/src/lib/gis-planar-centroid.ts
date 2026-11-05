import type { Geometry, Position } from "geojson";

/** GEOS-style planar centroid in the input CRS. GeoJSON here uses degrees;
 * this is not a geodesic centre and does not unwrap the antimeridian. */
export function planarCentroid(geometry: Geometry): [number, number] {
  let area = 0, ax = 0, ay = 0, length = 0, lx = 0, ly = 0;
  const points: Position[] = [];
  const line = (coordinates: Position[]) => {
    points.push(...coordinates);
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1], b = coordinates[i];
      const weight = Math.hypot(b[0] - a[0], b[1] - a[1]);
      length += weight;
      lx += weight * (a[0] + b[0]) / 2;
      ly += weight * (a[1] + b[1]) / 2;
    }
  };
  const polygon = (rings: Position[][]) => {
    rings.forEach((ring, index) => {
      line(ring);
      const [ox, oy] = ring[0];
      let crossSum = 0, x = 0, y = 0;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const cross = (a[0] - ox) * (b[1] - oy) - (b[0] - ox) * (a[1] - oy);
        crossSum += cross;
        x += (a[0] + b[0] - 2 * ox) * cross;
        y += (a[1] + b[1] - 2 * oy) * cross;
      }
      if (crossSum === 0) return;
      const weight = Math.abs(crossSum / 2) * (index === 0 ? 1 : -1);
      area += weight;
      ax += weight * (ox + x / (3 * crossSum));
      ay += weight * (oy + y / (3 * crossSum));
    });
  };
  switch (geometry.type) {
    case "Polygon": polygon(geometry.coordinates); break;
    case "MultiPolygon": geometry.coordinates.forEach(polygon); break;
    case "LineString": line(geometry.coordinates); break;
    case "MultiLineString": geometry.coordinates.forEach(line); break;
    case "Point": points.push(geometry.coordinates); break;
    case "MultiPoint": points.push(...geometry.coordinates); break;
    default: throw new Error("Centróide: tipo de geometria não suportado.");
  }
  if (area > 0) return [ax / area, ay / area];
  if (length > 0) return [lx / length, ly / length];
  if (!points.length) throw new Error("Centróide: geometria vazia.");
  return [points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length];
}

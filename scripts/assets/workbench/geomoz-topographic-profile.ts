/** Profile calculations shared by GeoMoz GIS Workspace's local DEM tool.
 * Coordinates use [longitude, latitude] (WGS84). Elevation comes only from
 * actual raster samples; no synthetic heights or interpolated NoData.
 */
export type LonLat = readonly [number, number];
export type ProfileSample = {
  longitude: number;
  latitude: number;
  distanceM: number;
  elevationM: number | null;
};
export interface ProfileStatistics {
  totalDistanceM: number;
  minElevM: number;
  maxElevM: number;
  meanElevM: number;
  gainM: number;
  lossM: number;
  validCount: number;
  sampleCount: number;
}
const EARTH_RADIUS_M = 6371008.8;
const radians = (degrees: number) => degrees * Math.PI / 180;

export function distanceMeters(a: LonLat, b: LonLat): number {
  const phi1 = radians(a[1]), phi2 = radians(b[1]);
  const dPhi = phi2 - phi1;
  let deltaLongitude = b[0] - a[0];
  if (deltaLongitude > 180) deltaLongitude -= 360;
  if (deltaLongitude < -180) deltaLongitude += 360;
  const dLambda = radians(deltaLongitude);
  const hav = Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, hav))));
}

export function profileLocations(vertices: LonLat[], count: number): ProfileSample[] {
  if (vertices.length < 2 || vertices.length > 50 ||
      !Number.isInteger(count) || count < 2 || count > 500 ||
      vertices.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) ||
        Math.abs(lon) > 180 || Math.abs(lat) > 90)) {
    throw new Error("Seleccione pelo menos dois pontos válidos e entre 2 e 500 amostras.");
  }
  const segments = vertices.slice(1).map((p, i) => distanceMeters(vertices[i], p));
  const cumulative = [0];
  for (const segment of segments) cumulative.push(cumulative[cumulative.length - 1] + segment);
  const total = cumulative[cumulative.length - 1];
  if (!Number.isFinite(total) || total < 1) throw new Error("O traçado deve ter pelo menos 1 metro.");
  return Array.from({ length: count }, (_, index) => {
    const distanceM = index === count - 1 ? total : total * index / (count - 1);
    let segment = 0;
    while (segment < segments.length - 1 && distanceM > cumulative[segment + 1]) segment++;
    const ratio = segments[segment] > 0
      ? (distanceM - cumulative[segment]) / segments[segment] : 0;
    const a = vertices[segment], b = vertices[segment + 1];
    let deltaLon = b[0] - a[0];
    if (deltaLon > 180) deltaLon -= 360;
    if (deltaLon < -180) deltaLon += 360;
    const unwrapped = a[0] + deltaLon * ratio;
    const longitude = ((unwrapped + 540) % 360) - 180;
    return {
      longitude, latitude: a[1] + (b[1] - a[1]) * ratio,
      distanceM, elevationM: null,
    };
  });
}

/** Find the actual sampled coordinate nearest to a distance along the drawn route.
 * Distances must be monotonically increasing, as returned by profileLocations.
 * Never infer an altitude or interpolate across raster NoData.
 */
export function nearestProfileSampleIndex(
  samples: readonly ProfileSample[], distanceM: number,
): number | null {
  if (!samples.length || !Number.isFinite(distanceM)) return null;
  if (distanceM <= samples[0].distanceM) return 0;
  const last = samples.length - 1;
  if (distanceM >= samples[last].distanceM) return last;
  let low = 0, high = last;
  while (high - low > 1) {
    const mid = Math.floor((high + low) / 2);
    if (samples[mid].distanceM <= distanceM) low = mid;
    else high = mid;
  }
  return distanceM - samples[low].distanceM <= samples[high].distanceM - distanceM
    ? low : high;
}

export function profileStatistics(samples: ProfileSample[]): ProfileStatistics | null {
  const finite = samples.filter(s => s.elevationM !== null && Number.isFinite(s.elevationM));
  if (!finite.length) return null;
  const elevations = finite.map(s => s.elevationM as number);
  let gainM = 0, lossM = 0;
  // Do not calculate ascent across NoData gaps.
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1].elevationM, current = samples[i].elevationM;
    if (previous === null || current === null || !Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const difference = current - previous;
    if (difference >= 0) gainM += difference;
    else lossM -= difference;
  }
  return {
    totalDistanceM: samples.at(-1)?.distanceM ?? 0,
    minElevM: Math.min(...elevations),
    maxElevM: Math.max(...elevations),
    meanElevM: elevations.reduce((sum, e) => sum + e, 0) / elevations.length,
    gainM, lossM, validCount: elevations.length, sampleCount: samples.length,
  };
}

export function profileToCSV(samples: ProfileSample[]): string {
  const header = "Amostra,Distancia_km,Elevacao_m,Longitude,Latitude";
  return [header, ...samples.map((s, i) => [
    i + 1, (s.distanceM / 1000).toFixed(4), s.elevationM?.toFixed(3) ?? "",
    s.longitude.toFixed(7), s.latitude.toFixed(7),
  ].join(","))].join("\r\n");
}

/**
 * Area of Interest (AOI) types — shared across all analysis pages.
 *
 * An AOI can be:
 * - A Mozambique province + district
 * - A custom GeoJSON geometry (uploaded or drawn by the user)
 * - The whole world (null geometry → GEE uses the region bbox)
 */

import type { WorldCountry } from "./world-countries";
import { countryToGeoJSON } from "./world-countries";

export type AOISource = "mozambique" | "country" | "upload" | "draw" | "global";

export interface AreaOfInterest {
  /** How this AOI was defined */
  source: AOISource;

  /** Mozambique province name (source === "mozambique") */
  province: string | null;

  /** Mozambique district name */
  district: string | null;

  /** Selected world country code (source === "country") */
  countryCode?: string | null;

  /** Selected world country name (source === "country") */
  countryName?: string | null;

  /** Custom GeoJSON geometry (source === "upload" | "draw" | "country") */
  geometry: GeoJSON.GeoJSON | null;

  /** Human-readable label for display */
  label: string;

  /** Bounds for the map view, can be used to fly to */
  bounds?: [[number, number], [number, number]] | null;
}

/** Default AOI — fully zoomed-out global view */
export const GLOBAL_AOI: AreaOfInterest = {
  source: "global",
  province: null,
  district: null,
  geometry: null,
  label: "Mundo (Global)",
};

/** Create a Mozambique province/district AOI */
export function mozambiqueAOI(
  province?: string | null,
  district?: string | null,
): AreaOfInterest {
  const label = district
    ? `${district}, ${province}`
    : province
      ? `${province} (Moçambique)`
      : "Moçambique (Nacional)";
  return {
    source: "mozambique",
    province: province ?? null,
    district: district ?? null,
    geometry: null,
    label,
  };
}

/** Create a country AOI for any sovereign nation in the world */
export function countryAOI(country: WorldCountry): AreaOfInterest {
  const geojson = countryToGeoJSON(country);
  return {
    source: "country",
    province: null,
    district: null,
    countryCode: country.code,
    countryName: country.name,
    geometry: geojson,
    label: `${country.flag} ${country.name}`,
    bounds: country.bounds,
  };
}

/** Create a custom-GeoJSON AOI from upload or drawing */
export function customAOI(
  geometry: GeoJSON.GeoJSON,
  label: string,
  source: "upload" | "draw",
): AreaOfInterest {
  return {
    source,
    province: null,
    district: null,
    geometry,
    label,
    bounds: computeGeoJSONBounds(geometry),
  };
}

/**
 * Helper to compute bounds [[south, west], [north, east]] from any GeoJSON geometry.
 */
export function computeGeoJSONBounds(geojson: GeoJSON.GeoJSON): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const scan = (coords: any) => {
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else if (Array.isArray(coords)) {
      coords.forEach(scan);
    }
  };

  if ((geojson as any).coordinates) {
    scan((geojson as any).coordinates);
  } else if ((geojson as any).features) {
    for (const f of (geojson as any).features) {
      if (f.geometry?.coordinates) scan(f.geometry.coordinates);
    }
  } else if ((geojson as any).geometry?.coordinates) {
    scan((geojson as any).geometry.coordinates);
  }

  if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
    return [[minY, minX], [maxY, maxX]]; // [[south, west], [north, east]]
  }
  return null;
}

export interface AOIMetrics {
  areaKm2: number;
  areaHa: number;
  perimeterKm: number;
  vertexCount: number;
  centroid: [number, number]; // [lat, lng]
}

/**
 * Compute key geometric metrics for an AOI geometry
 */
export function computeAOIMetrics(geojson: GeoJSON.GeoJSON | null): AOIMetrics | null {
  if (!geojson) return null;
  const coordsList: [number, number][] = [];
  const scan = (c: any) => {
    if (typeof c[0] === "number") {
      coordsList.push([c[0], c[1]]); // [lng, lat]
    } else if (Array.isArray(c)) {
      c.forEach(scan);
    }
  };

  if ((geojson as any).coordinates) {
    scan((geojson as any).coordinates);
  } else if ((geojson as any).features) {
    for (const f of (geojson as any).features) {
      if (f.geometry?.coordinates) scan(f.geometry.coordinates);
    }
  } else if ((geojson as any).geometry?.coordinates) {
    scan((geojson as any).geometry.coordinates);
  }

  if (coordsList.length === 0) return null;

  // Centroid
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of coordsList) {
    sumLng += lng;
    sumLat += lat;
  }
  const centroid: [number, number] = [
    +(sumLat / coordsList.length).toFixed(4),
    +(sumLng / coordsList.length).toFixed(4),
  ];

  // Approximate Area & Perimeter using spherical projection at centroid latitude
  const R = 6371; // Earth radius in km
  const rad = Math.PI / 180;
  const cosLat = Math.cos(centroid[0] * rad);

  let perimeterKm = 0;
  for (let i = 0; i < coordsList.length - 1; i++) {
    const [lng1, lat1] = coordsList[i];
    const [lng2, lat2] = coordsList[i + 1];
    const dx = (lng2 - lng1) * rad * R * cosLat;
    const dy = (lat2 - lat1) * rad * R;
    perimeterKm += Math.sqrt(dx * dx + dy * dy);
  }

  // Shoelace area
  let areaKm2 = 0;
  for (let i = 0; i < coordsList.length - 1; i++) {
    const [x1, y1] = coordsList[i];
    const [x2, y2] = coordsList[i + 1];
    const px1 = x1 * rad * R * cosLat;
    const py1 = y1 * rad * R;
    const px2 = x2 * rad * R * cosLat;
    const py2 = y2 * rad * R;
    areaKm2 += (px1 * py2 - px2 * py1);
  }
  areaKm2 = Math.abs(areaKm2) / 2;
  const areaHa = areaKm2 * 100;

  return {
    areaKm2: +areaKm2.toFixed(2),
    areaHa: +areaHa.toFixed(1),
    perimeterKm: +perimeterKm.toFixed(2),
    vertexCount: coordsList.length,
    centroid,
  };
}

/** Serialise an AOI for sending in API request bodies */
export function aoiToAPI(aoi: AreaOfInterest): {
  province?: string | null;
  district?: string | null;
  geometry?: Record<string, unknown> | null;
} {
  if (aoi.source === "mozambique") {
    return {
      province: aoi.province,
      district: aoi.district,
      geometry: null,
    };
  }
  if (aoi.source === "upload" || aoi.source === "draw" || aoi.source === "country") {
    // Extract geometry from FeatureCollection or Feature if needed
    let geom: Record<string, unknown> | null = null;
    if (aoi.geometry) {
      // GeoJSON types don't have index signatures, so we go via unknown
      const gj = aoi.geometry as unknown as Record<string, unknown>;
      if (gj.type === "FeatureCollection") {
        const rawFeatures = (gj as Record<string, unknown>).features;
        const features = Array.isArray(rawFeatures) ? (rawFeatures as Record<string, unknown>[]) : [];
        if (features.length > 0) {
          const first = features[0];
          if (first?.type === "Feature") {
            geom = (first.geometry as Record<string, unknown>) ?? first;
          } else {
            geom = first ?? null;
          }
        }
      } else if (gj.type === "Feature") {
        geom = (gj.geometry as Record<string, unknown>) ?? gj;
      } else {
        // Direct geometry (Polygon, MultiPolygon, etc.)
        geom = gj;
      }
    }
    return { province: null, district: null, geometry: geom ?? null };
  }
  // Global / no region
  return { province: null, district: null, geometry: null };
}

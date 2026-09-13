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

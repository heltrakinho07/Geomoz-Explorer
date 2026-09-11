import type { StyleSpecification } from "maplibre-gl";
import type * as maplibregl from "maplibre-gl";
import type { BasemapType } from "./basemaps";

/**
 * AWS Open Data Terrarium 3D Digital Elevation Model (DEM)
 * Global 30m resolution derived from Copernicus GLO-30, SRTM, and ArcticDEM.
 * Free, public, no token required. MapLibre natively decodes 'terrarium' encoding.
 */
export const AWS_TERRARIUM_DEM_TILES = [
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
];

export const TERRAIN_SOURCE_ID = "aws-terrarium-dem";
export const BASEMAP_SOURCE_ID = "google-basemap-raster";
export const BASEMAP_LAYER_ID = "google-basemap-layer";

/**
 * Maps BasemapType to Google Maps lyrs parameters:
 * - hybrid: lyrs=y (satellite + labels/borders)
 * - satellite: lyrs=s (pure satellite)
 * - terrain: lyrs=p (shaded relief + roads)
 * - roadmap: lyrs=m (standard road map)
 */
const GOOGLE_LYRS: Record<BasemapType, string> = {
  hybrid: "y",
  satellite: "s",
  terrain: "p",
  roadmap: "m",
};

export function getGoogleTileUrls(type: BasemapType): string[] {
  const lyrs = GOOGLE_LYRS[type] || "y";
  return [
    `https://mt0.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
    `https://mt1.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
    `https://mt2.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
    `https://mt3.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
  ];
}

/**
 * Creates a complete MapLibre style with Google Maps draped over 3D terrain
 * and realistic atmospheric sky.
 */
export function createMapLibreStyle(basemap: BasemapType = "hybrid"): StyleSpecification {
  return {
    version: 8,
    name: "GeoMoz 3D Global Terrain",
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: "raster",
        tiles: getGoogleTileUrls(basemap),
        tileSize: 256,
        attribution: "&copy; Google Maps",
        maxzoom: 20,
      },
      [TERRAIN_SOURCE_ID]: {
        type: "raster-dem",
        tiles: AWS_TERRARIUM_DEM_TILES,
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
      },
    },
    layers: [
      {
        id: BASEMAP_LAYER_ID,
        type: "raster",
        source: BASEMAP_SOURCE_ID,
        minzoom: 0,
        maxzoom: 22,
      },
    ],
    sky: {
      "sky-color": "#87ceeb",
      "horizon-color": "#e0f2fe",
      "fog-color": "#bae6fd",
      "atmosphere-blend": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2, 0.2,
        6, 0.7,
        10, 0.95
      ],
    },
  };
}

/**
 * Calculates Great-Circle distance between two [lng, lat] coordinates in meters.
 */
export function haversineDistance(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the initial bearing from point 1 to point 2 in degrees (0 = North, 90 = East).
 */
export function calculateBearing(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

export interface ProfilePoint {
  index: number;
  distanceKm: number;
  elevationM: number;
  lat: number;
  lng: number;
}

export interface ProfileStats {
  points: ProfilePoint[];
  start: [number, number]; // [lng, lat]
  end: [number, number];   // [lng, lat]
  totalDistanceKm: number;
  minElevation: number;
  maxElevation: number;
  elevationGain: number;
  elevationLoss: number;
  meanElevation: number;
  avgSlopePercent: number;
}

/**
 * Samples elevation along a line from start [lng, lat] to end [lng, lat]
 * using MapLibre's terrain elevation engine.
 */
export function sampleElevationProfile(
  map: maplibregl.Map,
  start: [number, number],
  end: [number, number],
  sampleCount = 80
): ProfileStats {
  const totalMeters = haversineDistance(start, end);
  const totalDistanceKm = totalMeters / 1000;
  const points: ProfilePoint[] = [];

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let elevationGain = 0;
  let elevationLoss = 0;
  let sumElevation = 0;
  let prevElevation: number | null = null;

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const lng = start[0] + (end[0] - start[0]) * t;
    const lat = start[1] + (end[1] - start[1]) * t;
    const distanceKm = totalDistanceKm * t;

    // Query elevation from MapLibre DEM mesh
    const queriedElev = map.queryTerrainElevation([lng, lat]);
    const elevationM = Math.round(queriedElev ?? 0);

    minElevation = Math.min(minElevation, elevationM);
    maxElevation = Math.max(maxElevation, elevationM);
    sumElevation += elevationM;

    if (prevElevation !== null) {
      const diff = elevationM - prevElevation;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
    prevElevation = elevationM;

    points.push({
      index: i,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      elevationM,
      lat: parseFloat(lat.toFixed(5)),
      lng: parseFloat(lng.toFixed(5)),
    });
  }

  if (minElevation === Infinity) minElevation = 0;
  if (maxElevation === -Infinity) maxElevation = 0;

  const meanElevation = Math.round(sumElevation / (points.length || 1));
  const avgSlopePercent =
    totalMeters > 0
      ? parseFloat((((elevationGain + elevationLoss) / totalMeters) * 100).toFixed(1))
      : 0;

  return {
    points,
    start,
    end,
    totalDistanceKm: parseFloat(totalDistanceKm.toFixed(2)),
    minElevation,
    maxElevation,
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    meanElevation,
    avgSlopePercent,
  };
}

/**
 * Aligns the camera in 3D perspective to view the profile section
 * from an oblique 3D angle.
 */
export function alignCameraToSection(
  map: maplibregl.Map,
  start: [number, number],
  end: [number, number]
): void {
  const midLng = (start[0] + end[0]) / 2;
  const midLat = (start[1] + end[1]) / 2;
  const lineBearing = calculateBearing(start, end);
  // View perpendicular to the profile cut for optimal cross-section perspective
  const cameraBearing = (lineBearing + 90) % 360;

  map.flyTo({
    center: [midLng, midLat],
    pitch: 62,
    bearing: cameraBearing,
    duration: 1800,
    essential: true,
  });
}


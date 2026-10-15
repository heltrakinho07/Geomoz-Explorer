/**
 * Deterministic GIS vector command engine for the production GIS Workspace.
 * Inspired by the separated algorithm/worker architecture of GeoLibre (MIT)
 * and RustGIS (Apache-2.0). Uses GeoMoz's existing Turf.js algorithms, NOT
 * bundled RustGIS, Whitebox or GeoLibre binaries.
 */
import type { FeatureCollection } from "geojson";
import {
  runVectorBuffer, runVectorCentroids, runVectorConvexHull, runVectorBBox,
  runVectorDissolve, runVectorSimplify, runVectorExplode, runVectorMetrics,
  runVectorIntersect, runVectorDifference, runVectorPointsInPolygon,
  type GeoprocessingStats,
} from "./wasm-geoprocessing";

export const GIS_VECTOR_COMMANDS = [
  "vector_buffer", "vector_centroids", "vector_convexhull", "vector_bbox",
  "vector_dissolve", "vector_simplify", "vector_explode", "vector_calc_metrics",
  "vector_intersect", "vector_difference", "vector_points_in_poly",
] as const;

export type GISVectorCommand = (typeof GIS_VECTOR_COMMANDS)[number];
export type GISVectorParameters = Record<string, unknown>;

export interface GISVectorResult {
  result: FeatureCollection;
  stats: GeoprocessingStats;
  provenance: {
    tool: GISVectorCommand;
    engine: "Turf.js";
    inputFeatureCount: number;
    overlayFeatureCount: number | null;
    parameters: GISVectorParameters;
    durationMs: number;
  };
}

function validGeometryCoordinates(value: unknown, depth = 0): void {
  if (depth > 14 || !Array.isArray(value) || !value.length) {
    throw new Error("Estrutura de coordenadas GeoJSON inválida.");
  }
  if (typeof value[0] === "number") {
    const lon = value[0], lat = value[1];
    if (typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat) ||
        Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      throw new Error("A camada deve ter coordenadas finitas EPSG:4326 (longitude/latitude).");
    }
    return;
  }
  for (const child of value) validGeometryCoordinates(child, depth + 1);
}

export function validateGISVectorLayer(input: FeatureCollection, label: string): void {
  if (!input || input.type !== "FeatureCollection" || !Array.isArray(input.features) ||
      !input.features.length || input.features.length > 5000) {
    throw new Error(`${label}: requer 1 a 5 000 feições GeoJSON.`);
  }
  for (const feature of input.features) {
    if (!feature || feature.type !== "Feature" || !feature.geometry) {
      throw new Error(`${label}: feição GeoJSON inválida.`);
    }
    const geom = feature.geometry;
    if (!("coordinates" in geom)) {
      throw new Error(`${label}: GeometryCollection requer preparação prévia.`);
    }
    validGeometryCoordinates(geom.coordinates);
  }
}

function assertGeometries(fc: FeatureCollection, types: string[], layer: string): void {
  if (fc.features.some((feature) => !types.includes(feature.geometry.type))) {
    throw new Error(`${layer} deve conter apenas geometria ${types.join(" / ")}.`);
  }
}

function numberBetween(value: unknown, defaultValue: number, min: number, max: number, label: string): number {
  const numeric = value === undefined ? defaultValue : Number(value);
  if (value === "" || value === null || typeof value === "boolean" ||
      !Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label}: valor numérico deve estar entre ${min} e ${max}.`);
  }
  return numeric;
}

export function executeGISVectorCommand(
  toolId: string, input: FeatureCollection,
  parameters: GISVectorParameters = {}, overlay?: FeatureCollection,
): GISVectorResult {
  if (!(GIS_VECTOR_COMMANDS as readonly string[]).includes(toolId)) {
    throw new Error(`Ferramenta vectorial não implementada: ${toolId}.`);
  }
  validateGISVectorLayer(input, "Camada de entrada");
  const command = toolId as GISVectorCommand;
  const requiresOverlay = command === "vector_intersect" ||
    command === "vector_difference" || command === "vector_points_in_poly";
  if (requiresOverlay && !overlay) {
    throw new Error("Esta operação requer uma segunda camada.");
  }
  if (requiresOverlay && overlay) {
    validateGISVectorLayer(overlay, "Camada de sobreposição");
    if (input.features.length * overlay.features.length > 100000) {
      throw new Error("Sobreposição demasiado grande: máximo 100 000 pares de feições.");
    }
  }
  if (command === "vector_intersect" || command === "vector_difference" ||
      command === "vector_dissolve") {
    assertGeometries(input, ["Polygon", "MultiPolygon"], "A primeira camada");
  }
  if ((command === "vector_intersect" || command === "vector_difference") && overlay) {
    assertGeometries(overlay, ["Polygon", "MultiPolygon"], "A segunda camada");
  }
  if (command === "vector_points_in_poly") {
    assertGeometries(input, ["Polygon", "MultiPolygon"], "A primeira camada");
    assertGeometries(overlay!, ["Point"], "A segunda camada");
  }

  const started = performance.now();
  let execution: { result: FeatureCollection; stats: GeoprocessingStats };
  switch (command) {
    case "vector_buffer": {
      const units = parameters.units ?? "meters";
      if (units !== "meters" && units !== "kilometers") {
        throw new Error("Buffer exige unidades em metros ou quilómetros.");
      }
      const distance = numberBetween(parameters.distance, 1000, 0.01,
        units === "meters" ? 100000 : 100, "Distância");
      execution = runVectorBuffer(input, distance, units, parameters.dissolve === true);
      break;
    }
    case "vector_centroids": execution = runVectorCentroids(input); break;
    case "vector_convexhull": execution = runVectorConvexHull(input); break;
    case "vector_bbox": execution = runVectorBBox(input); break;
    case "vector_dissolve":
      execution = runVectorDissolve(input, String(parameters.propertyName ?? ""));
      break;
    case "vector_simplify":
      execution = runVectorSimplify(input,
        numberBetween(parameters.tolerance, 0.005, 0.000001, 0.05, "Tolerância"),
        parameters.highQuality !== false);
      break;
    case "vector_explode": execution = runVectorExplode(input); break;
    case "vector_calc_metrics": execution = runVectorMetrics(input); break;
    case "vector_intersect": execution = runVectorIntersect(input, overlay!); break;
    case "vector_difference": execution = runVectorDifference(input, overlay!); break;
    case "vector_points_in_poly": execution = runVectorPointsInPolygon(input, overlay!); break;
  }
  if (!execution.result || execution.result.type !== "FeatureCollection" ||
      !Array.isArray(execution.result.features)) {
    throw new Error("O motor vectorial não devolveu uma camada GeoJSON.");
  }
  // Empty intersection/difference is a legitimate spatial result, unlike
  // missing data or the operation silently failing.
  if (execution.result.features.length === 0 &&
      command !== "vector_intersect" && command !== "vector_difference") {
    throw new Error("Operação sem geometrias válidas. Verifique as feições de entrada.");
  }
  if (execution.result.features.length > 5000) {
    throw new Error("Resultado com mais de 5 000 feições. Reduza a AOI.");
  }
  return {
    ...execution,
    provenance: {
      tool: command, engine: "Turf.js",
      inputFeatureCount: input.features.length,
      overlayFeatureCount: requiresOverlay ? overlay!.features.length : null,
      parameters: { ...parameters },
      durationMs: Math.round(performance.now() - started),
    },
  };
}

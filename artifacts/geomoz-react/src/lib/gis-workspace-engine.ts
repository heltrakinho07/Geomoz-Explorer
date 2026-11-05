/**
 * GeoMoz GIS Workspace — deterministic vector-processing command registry.
 *
 * Architecture informed by GeoLibre's @geolibre/processing algorithm registry
 * (https://github.com/opengeos/GeoLibre, MIT) and RustGIS's independent
 * analysis/engine command layers (https://github.com/opengeos/RustGIS,
 * Apache-2.0). This module is original glue around the GeoMoz Turf.js
 * algorithms; it does NOT claim to embed RustGIS or GeoLibre WASM binaries.
 *
 * Real computation, on user-provided GeoJSON, in the browser without upload.
 */
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  runVectorBBox, runVectorBuffer, runVectorCentroids, runVectorConvexHull,
  runVectorDissolve, runVectorExplode, runVectorIntersect, runVectorMetrics,
  runVectorPointsInPolygon, runVectorSimplify, type GeoprocessingStats,
} from "@/lib/wasm-geoprocessing";
import { MAX_WORKSPACE_FEATURES, normalizeWorkspaceGeoJSON } from "@/lib/gis-workspace";

export type WorkspaceOperationId =
  | "vector_buffer" | "vector_centroids" | "vector_convexhull" | "vector_bbox"
  | "vector_dissolve" | "vector_simplify" | "vector_explode" | "vector_calc_metrics"
  | "vector_intersect" | "vector_difference" | "vector_points_in_poly";

export interface WorkspaceOperation {
  id: WorkspaceOperationId;
  label: string;
  group: "Geometria" | "Sobreposição" | "Atributos";
  description: string;
  requiresOverlay?: boolean;
  parameters?: Array<{
    id: string;
    label: string;
    kind: "number" | "boolean" | "text" | "select";
    defaultValue: string | number | boolean;
    min?: number;
    max?: number;
    options?: { value: string; label: string }[];
  }>;
}

export const WORKSPACE_OPERATIONS: WorkspaceOperation[] = [
  { id: "vector_buffer", label: "Buffer geodésico", group: "Geometria",
    description: "Zona de influência em metros ou quilómetros (Turf.js).",
    parameters: [
      { id: "distance", label: "Distância", kind: "number", min: 0.01, max: 100000, defaultValue: 1000 },
      { id: "units", label: "Unidade", kind: "select", defaultValue: "meters",
        options: [{ value: "meters", label: "Metros" }, { value: "kilometers", label: "Quilómetros" }] },
      { id: "dissolve", label: "Dissolver buffers", kind: "boolean", defaultValue: false },
    ] },
  { id: "vector_centroids", label: "Centróides", group: "Geometria",
    description: "Gera pontos representativos para as feições." },
  { id: "vector_convexhull", label: "Envelope convexo", group: "Geometria",
    description: "Menor invólucro convexo das geometrias." },
  { id: "vector_bbox", label: "Extensão (bounding box)", group: "Geometria",
    description: "Polígono da extensão espacial da camada." },
  { id: "vector_dissolve", label: "Dissolver polígonos", group: "Geometria",
    description: "Agrega polígonos, opcionalmente por atributo.",
    parameters: [{ id: "propertyName", label: "Campo de agrupamento (opcional)",
      kind: "text", defaultValue: "" }] },
  { id: "vector_simplify", label: "Simplificar geometria", group: "Geometria",
    description: "Simplificação de vértices; tolerância em graus de coordenadas WGS84.",
    parameters: [{ id: "tolerance", label: "Tolerância (graus)",
      kind: "number", defaultValue: 0.0005, min: 0.000001, max: 0.05 }] },
  { id: "vector_explode", label: "Extrair vértices", group: "Geometria",
    description: "Transforma os vértices da camada em pontos." },
  { id: "vector_calc_metrics", label: "Área e comprimento", group: "Atributos",
    description: "Acrescenta medidas geodésicas calculadas aos atributos." },
  { id: "vector_intersect", label: "Intersecção de polígonos", group: "Sobreposição",
    description: "Geometrias da sobreposição entre duas camadas poligonais.",
    requiresOverlay: true },
  { id: "vector_difference", label: "Diferença (Erase)", group: "Sobreposição",
    description: "Remove da entrada as áreas cobertas pela camada de máscara.",
    requiresOverlay: true },
  { id: "vector_points_in_poly", label: "Contar pontos por polígono", group: "Sobreposição",
    description: "Primeira camada: polígonos; segunda: pontos.",
    requiresOverlay: true },
];

export type WorkspaceParameters = Record<string, string | number | boolean | undefined>;

export interface WorkspaceExecution {
  result: FeatureCollection;
  stats: GeoprocessingStats;
  provenance: {
    command: WorkspaceOperationId;
    engine: "Turf.js (navegador)";
    inputFeatures: number;
    overlayFeatures: number | null;
    parameters: WorkspaceParameters;
    completedAt: string;
    durationMs: number;
  };
}

export function getWorkspaceOperation(id: string): WorkspaceOperation | undefined {
  return WORKSPACE_OPERATIONS.find((tool) => tool.id === id);
}

function polygonsOnly(fc: FeatureCollection, label: string): void {
  if (fc.features.some((f) => !["Polygon", "MultiPolygon"].includes(f.geometry?.type ?? ""))) {
    throw new Error(`${label} deve conter apenas polígonos ou multipolígonos.`);
  }
}

function pointsOnly(fc: FeatureCollection, label: string): void {
  if (fc.features.some((f) => f.geometry?.type !== "Point")) {
    throw new Error(`${label} deve conter apenas pontos.`);
  }
}

function finiteParameter(value: unknown, label: string, low: number, high: number): number {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") {
    throw new Error(`${label}: indique um número válido.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < low || number > high) {
    throw new Error(`${label}: valor deve estar entre ${low} e ${high}.`);
  }
  return number;
}

function differencePolygons(input: FeatureCollection, overlay: FeatureCollection):
  { result: FeatureCollection; stats: GeoprocessingStats } {
  const start = performance.now();
  const polygons: Feature<Polygon | MultiPolygon>[] = [];
  for (const [i, feature] of input.features.entries()) {
    let remainder = feature as Feature<Polygon | MultiPolygon>;
    let removed = false;
    for (const [j, mask] of overlay.features.entries()) {
      let clipped;
      try {
        clipped = turf.difference(turf.featureCollection([
          remainder, mask as Feature<Polygon | MultiPolygon>,
        ]));
      } catch (cause) {
        throw new Error(`Diferença falhou nas feições ${i + 1} e ${j + 1}: ${String(cause)}`);
      }
      if (!clipped) {
        removed = true;
        break;
      }
      remainder = { ...clipped, properties: { ...(feature.properties ?? {}) } };
    }
    if (!removed) polygons.push(remainder);
  }
  const result: FeatureCollection = turf.featureCollection(polygons);
  const durationMs = Math.round(performance.now() - start);
  return { result, stats: {
    executionTimeMs: durationMs,
    inputFeatureCount: input.features.length,
    outputFeatureCount: result.features.length,
    geometryType: "Polygon/MultiPolygon",
    totalAreaKm2: result.features.reduce((sum, item) => sum + turf.area(item) / 1e6, 0),
    summary: `Diferença calculada: ${result.features.length} feições remanescentes.`,
  } };
}

/** A missing/invalid command or layer never returns a fake successful result. */
export function executeWorkspaceOperation(
  id: WorkspaceOperationId,
  rawInput: FeatureCollection,
  rawOverlay?: FeatureCollection,
  params: WorkspaceParameters = {},
): WorkspaceExecution {
  const operation = getWorkspaceOperation(id);
  if (!operation) throw new Error(`Operação desconhecida: ${id}`);
  // WGS84 validation and hard bounds happen before any processing.
  const input = normalizeWorkspaceGeoJSON(rawInput);
  const overlay = rawOverlay ? normalizeWorkspaceGeoJSON(rawOverlay) : undefined;
  if (operation.requiresOverlay && !overlay) {
    throw new Error("Esta operação exige uma segunda camada.");
  }
  if (input.features.length > MAX_WORKSPACE_FEATURES ||
      (overlay?.features.length ?? 0) > MAX_WORKSPACE_FEATURES) {
    throw new Error("Demasiadas feições para processamento local.");
  }
  if (["vector_intersect", "vector_difference", "vector_points_in_poly"].includes(id) &&
      input.features.length * (overlay?.features.length ?? 0) > 100000) {
    throw new Error("Sobreposição demasiado grande para o navegador. Divida as camadas por AOI.");
  }

  const start = performance.now();
  let output: { result: FeatureCollection; stats: GeoprocessingStats };

  switch (id) {
    case "vector_buffer": {
      const units = params.units ?? "meters";
      if (units !== "meters" && units !== "kilometers") throw new Error("Unidade não suportada.");
      const distance = finiteParameter(params.distance ?? 1000, "Distância", 0.01, units === "kilometers" ? 100 : 100000);
      output = runVectorBuffer(input, distance, units, params.dissolve === true);
      break;
    }
    case "vector_centroids": output = runVectorCentroids(input); break;
    case "vector_convexhull": output = runVectorConvexHull(input); break;
    case "vector_bbox": output = runVectorBBox(input); break;
    case "vector_dissolve":
      polygonsOnly(input, "A camada de entrada");
      output = runVectorDissolve(input, String(params.propertyName ?? "").trim());
      break;
    case "vector_simplify":
      output = runVectorSimplify(input,
        finiteParameter(params.tolerance ?? 0.0005, "Tolerância", 0.000001, 0.05), true);
      break;
    case "vector_explode": output = runVectorExplode(input); break;
    case "vector_calc_metrics": output = runVectorMetrics(input); break;
    case "vector_intersect":
      polygonsOnly(input, "A primeira camada");
      polygonsOnly(overlay!, "A segunda camada");
      output = runVectorIntersect(input, overlay!);
      break;
    case "vector_difference":
      polygonsOnly(input, "A primeira camada");
      polygonsOnly(overlay!, "A segunda camada");
      output = differencePolygons(input, overlay!);
      break;
    case "vector_points_in_poly":
      polygonsOnly(input, "A primeira camada");
      pointsOnly(overlay!, "A segunda camada");
      output = runVectorPointsInPolygon(input, overlay!);
      break;
    default: {
      const neverOperation: never = id;
      throw new Error(`Operação não suportada: ${neverOperation}`);
    }
  }
  // Empty intersections/differences are valid and explicitly labelled "no overlap".
  if (output.result.type !== "FeatureCollection" || !Array.isArray(output.result.features)) {
    throw new Error("O motor GIS não devolveu uma colecção válida.");
  }
  if (output.result.features.length > MAX_WORKSPACE_FEATURES) {
    throw new Error("Resultado excede o limite de 5 000 feições. Reduza a AOI.");
  }
  if (output.result.features.length === 0 &&
      !["vector_intersect", "vector_difference", "vector_points_in_poly"].includes(id)) {
    throw new Error("A operação não produziu geometria válida. Verifique os dados de entrada.");
  }
  // Verify returned coordinates (but allow an empty, valid GeoJSON result).
  if (output.result.features.length > 0) normalizeWorkspaceGeoJSON(output.result);
  const durationMs = Math.round(performance.now() - start);
  return {
    ...output,
    provenance: {
      command: id,
      engine: "Turf.js (navegador)",
      inputFeatures: input.features.length,
      overlayFeatures: overlay?.features.length ?? null,
      parameters: { ...params },
      completedAt: new Date().toISOString(),
      durationMs,
    },
  };
}

/**
 * Safe, truthful exports of a GeoMoz project.
 * No invented geometry or synthetic results are ever inserted into downloads.
 */
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoMozProject, StudyRun } from "@/types/project";

export function escapeReportHtml(value: unknown): string {
  const raw = String(value ?? "");
  return raw.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/** Avoid path separators and unsafe characters in the download filename. */
export function safeReportFilename(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "estudo";
}

/** Serialize CSV cells safely against spreadsheet-formula injection. */
export function safeCsvCell(value: string | number | null | undefined): string {
  let text = String(value ?? "");
  // Opening exported CSV in spreadsheet software must not evaluate user text.
  // Quoting CSV fields alone does not prevent formula interpretation.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

export function buildProjectMetricsCsv(project: GeoMozProject, runs: StudyRun[]): string {
  const headers = [
    "Projeto", "Categoria", "AOI", "Analise", "Sensor", "Codigo", "DataInicio",
    "DataFim", "Media", "Min", "Max", "Nuvens_Pct", "DataExecucao",
  ];
  const rows: (string | number | undefined)[][] = runs.map((run) => [
    project.name,
    project.category,
    project.aoi.label,
    run.name,
    run.sensor,
    run.code,
    run.dateRange.start,
    run.dateRange.end,
    run.metrics?.mean,
    run.metrics?.min,
    run.metrics?.max,
    run.metrics?.cloudCoverPercentage,
    run.createdAt,
  ]);
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
}

function isGeometry(value: unknown): value is Geometry {
  return !!value && typeof value === "object" &&
    ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"]
      .includes((value as { type?: string }).type ?? "");
}

/**
 * Preserve real user-defined geometries. A Mozambique province/district label
 * without a polygon is NOT equivalent to a fabricated point at country centre.
 */
export function buildProjectAOIGeoJSON(project: GeoMozProject): FeatureCollection | null {
  const source = project.aoi.geometry;
  if (!source) return null;
  if (source.type === "FeatureCollection") {
    if (!Array.isArray(source.features) || source.features.length === 0) return null;
    return { type: "FeatureCollection", features: source.features as Feature[] };
  }
  if (source.type === "Feature") {
    return { type: "FeatureCollection", features: [source as Feature] };
  }
  if (isGeometry(source)) {
    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: source,
        properties: {
          projectId: project.id,
          name: project.name,
          aoiLabel: project.aoi.label,
          source: project.aoi.source,
        },
      }],
    };
  }
  return null;
}

export function printableMetric(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "—";
}

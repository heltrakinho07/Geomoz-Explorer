import type { TemporalReplay, StudyRun } from "@/types/project";

/** Persist only reproducible scientific inputs, never transient Earth Engine
 * map IDs, OAuth tokens, model API keys, or the user's full chat history. */
export function makeTemporalReplay(run: unknown, temporalChange: unknown): TemporalReplay | null {
  if (!run || typeof run !== "object" || !temporalChange || typeof temporalChange !== "object") return null;
  const source = run as { output?: { provenance?: { scope?: Record<string, unknown>; parameters?: Record<string, unknown> } } };
  const t = temporalChange as Record<string, any>;
  const scope = source.output?.provenance?.scope;
  if (!scope || typeof scope !== "object") return null;
  const aoi: Record<string, unknown> = {};
  for (const key of ["source", "label", "province", "district", "countryCode", "boundarySource", "adminLevel", "admin1Code", "admin2Code"]) {
    const value = scope[key];
    if (typeof value === "string" || typeof value === "number" || value === null) aoi[key] = value;
  }
  if (scope.geometry && typeof scope.geometry === "object") {
    const serialized = JSON.stringify(scope.geometry);
    if (serialized.length <= 100_000) aoi.geometry = scope.geometry;
    else return null; // Never silently replace a detailed polygon by its bounding box.
  }
  if (!aoi.geometry && !aoi.province && !aoi.countryCode) return null;
  const dates = [t.periodA?.startDate, t.periodA?.endDate, t.periodB?.startDate, t.periodB?.endDate];
  if (!dates.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) return null;
  if (!["ndvi", "ndwi", "mndwi", "ndbi", "nbr"].includes(String(t.index).toLowerCase())) return null;
  const sourceParams = source.output?.provenance?.parameters || {};
  const threshold = Number(t.threshold);
  const scale = Number(sourceParams.scale_m ?? 30);
  const clouds = Number(sourceParams.cloud_pct ?? 30);
  if (![threshold,scale,clouds].every(Number.isFinite) || threshold <= 0 || threshold > 2 || scale < 10 || scale > 20000 || clouds < 0 || clouds > 100) return null;
  return {
    version: 1,
    tool: "detect_temporal_change",
    aoi,
    args: {
      index: String(t.index).toLowerCase(),
      start_date_1: dates[0], end_date_1: dates[1],
      start_date_2: dates[2], end_date_2: dates[3],
      threshold, scale_m: scale, cloud_pct: clouds,
    },
  };
}

export function isTemporalReplay(run: StudyRun): run is StudyRun & { replay: TemporalReplay } {
  return run.replay?.version === 1 && run.replay.tool === "detect_temporal_change";
}

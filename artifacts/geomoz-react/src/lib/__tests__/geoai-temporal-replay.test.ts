import { describe, expect, it } from "vitest";
import { makeTemporalReplay } from "../geoai-temporal-replay";

const temporal = { index: "NDVI", threshold: 0.2, periodA: { startDate: "2020-01-01", endDate: "2021-01-01" }, periodB: { startDate: "2025-01-01", endDate: "2026-01-01" }, periodATileUrl: "secret-url", periodBTileUrl: "secret-url2" };
const run = { output: { provenance: { scope: { source: "mozambique", province: "Sofala", district: "Maringue", label: "Maringue, Sofala" }, parameters: { scale_m: 30, cloud_pct: 20, threshold: 0.2, access_token: "must-not-leak" } } } };

describe("GeoMoz AI temporal analysis replay", () => {
  it("preserves periods, thresholds, AOI and analysis parameters without credentials or old tiles", () => {
    const replay = makeTemporalReplay(run, temporal);
    expect(replay?.args).toEqual({ index: "ndvi", threshold: 0.2, scale_m: 30, cloud_pct: 20, start_date_1: "2020-01-01", end_date_1: "2021-01-01", start_date_2: "2025-01-01", end_date_2: "2026-01-01" });
    expect(replay?.aoi).toMatchObject({ province: "Sofala", district: "Maringue" });
    expect(JSON.stringify(replay)).not.toMatch(/secret-url|access_token|must-not-leak/);
  });
  it("does not recreate an AOI from a bounding box or an oversized polygon", () => {
    expect(makeTemporalReplay({ output: { provenance: { scope: { label: "AOI" } } } }, temporal)).toBeNull();
    const huge = { type: "Polygon", coordinates: [Array.from({ length: 20000 }, (_, i) => [30 + i * 0.00001, -18])] };
    expect(makeTemporalReplay({ output: { provenance: { scope: { geometry: huge } } } }, temporal)).toBeNull();
  });
  it("rejects invalid replay metadata instead of saving unusable studies", () => {
    expect(makeTemporalReplay(run, { ...temporal, threshold: Number.NaN })).toBeNull();
    expect(makeTemporalReplay(run, { ...temporal, periodA: { startDate: "invalid", endDate: "2021-01-01" } })).toBeNull();
  });
});

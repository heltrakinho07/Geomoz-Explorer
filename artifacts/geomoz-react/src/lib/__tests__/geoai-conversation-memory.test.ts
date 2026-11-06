import { describe, expect, it } from "vitest";
import { compactGeoAiHistory, safeGeoAiAoi, makeGeoAiAnalysisMemory } from "@/services/geoaiConversationService";

describe("GeoMoz AI private, bounded context memory", () => {
  const aoi = { source: "country", countryCode: "MOZ", boundarySource: "gaul2025",
    adminLevel: 2, admin1Code: 1484, admin2Code: 104314, label: "Montepuez, Cabo Delgado" };
  it("retains exact GAUL hierarchy and only successful scientific summaries", () => {
    const remembered = makeGeoAiAnalysisMemory(aoi, [
      { tool: "get_global_climate", output: { status: "success", summary: "ERA5-Land: 953.43 mm",
        source: { id: "ECMWF/ERA5_LAND/DAILY_AGGR" }, access_token: "secret" } },
    ], { startDate: "2025-01-01", endDate: "2026-01-01" });
    expect(remembered?.aoi).toMatchObject(aoi);
    expect(remembered?.tool).toBe("get_global_climate");
    expect(remembered?.sourceId).toBe("ECMWF/ERA5_LAND/DAILY_AGGR");
    expect(JSON.stringify(remembered)).not.toContain("access_token");
  });
  it("never stores large geometry by replacing it with bounding box", () => {
    expect(safeGeoAiAoi({ source: "draw", geometry: { type: "Polygon", coordinates: "A".repeat(100000) } })).toBeNull();
    expect(safeGeoAiAoi({ source: "global", label: "Mundo" })).toBeNull();
  });
  it("stores only the last 32 messages and redacts typical token patterns", () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({
      id: String(i), sender: "user" as const, text: "tok sk-" + "A".repeat(30),
      timestamp: "10:00", runs: [{ tileUrl: "no" }],
    }));
    const cleaned = compactGeoAiHistory(msgs);
    expect(cleaned).toHaveLength(32);
    expect(cleaned[0].id).toBe("8");
    expect(JSON.stringify(cleaned)).not.toContain("tileUrl");
    expect(cleaned[0].text).toContain("[credencial omitida]");
  });
});

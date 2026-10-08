import { describe, expect, it } from "vitest";
import type { GeoMozProject, StudyRun } from "@/types/project";
import {
  buildProjectAOIGeoJSON, buildProjectMetricsCsv, escapeReportHtml,
  printableMetric, safeCsvCell, safeReportFilename,
} from "../report-export";

const project: GeoMozProject = {
  id: "p-123", userId: "user-a", name: 'Área <Norte> & "Sul"',
  description: "Teste", category: "estudo_geral",
  aoi: {
    source: "draw", province: null, district: null, label: "Polígono da AOI",
    geometry: { type: "Polygon", coordinates: [[[32, -26], [33, -26], [33, -25], [32, -26]]] },
  },
  period: { startDate: "2026-01-01", endDate: "2026-04-01" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const run: StudyRun = {
  id: "r1", projectId: project.id, name: "=2+2",
  type: "remote_sensing", sensor: "Sentinel-2", code: "NDVI",
  dateRange: { start: "2026-01-01", end: "2026-03-01" },
  metrics: { mean: -0.15, min: -0.9, max: 0.82, cloudCoverPercentage: 12 },
  createdAt: "2026-04-01T00:00:00Z",
};

describe("secure project reports", () => {
  it("escapes every HTML metacharacter in untrusted text", () => {
    expect(escapeReportHtml('<img src="x" onerror=\'alert(1)\'> &'))
      .toBe("&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp;");
  });

  it("defuses spreadsheet formulas even inside quoted CSV fields", () => {
    expect(safeCsvCell("=HYPERLINK(\"https://evil\")"))
      .toBe('"\'=HYPERLINK(""https://evil"")"');
    expect(safeCsvCell("  @SUM(1)")).toBe('"\'  @SUM(1)"');
    expect(safeCsvCell("-1+cmd")).toBe('"\'-1+cmd"');
  });

  it("does not modify legitimate negative numeric measurements", () => {
    expect(safeCsvCell(-12.5)).toBe('"-12.5"');
    expect(safeCsvCell("NDVI, \"vegetação\"")).toBe('"NDVI, ""vegetação"""');
  });

  it("builds spreadsheet-safe output with BOM and reliable CSV columns", () => {
    const csv = buildProjectMetricsCsv(project, [run]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=2+2"');
    expect(csv).toContain('"-0.15"');
    expect(csv).toContain('"Área <Norte> & ""Sul"""');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("preserves real AOI polygon geometry without changing its coordinates", () => {
    const collection = buildProjectAOIGeoJSON(project);
    expect(collection?.features).toHaveLength(1);
    expect(collection?.features[0].geometry).toEqual(project.aoi.geometry);
  });

  it("never fabricates a centre point when an administrative AOI has no polygon", () => {
    const admin: GeoMozProject = {
      ...project,
      aoi: { source: "mozambique", province: "Maputo", district: null,
        geometry: null, label: "Maputo (Moçambique)" },
    };
    expect(buildProjectAOIGeoJSON(admin)).toBeNull();
  });

  it("retains all actual features in FeatureCollections", () => {
    const actual = { type: "FeatureCollection" as const, features: [
      { type: "Feature" as const, properties: { tag: "A" },
        geometry: { type: "Point" as const, coordinates: [32.5, -25.5] } },
      { type: "Feature" as const, properties: { tag: "B" },
        geometry: { type: "Point" as const, coordinates: [33.5, -24.5] } },
    ] };
    const transformed = buildProjectAOIGeoJSON({
      ...project, aoi: { ...project.aoi, geometry: actual },
    });
    expect(transformed?.features).toEqual(actual.features);
  });

  it("cleans filenames and rejects NaN as a scientific metric", () => {
    expect(safeReportFilename("../../Mapa de Água <2026>")).toBe("Mapa_de_Agua_2026");
    expect(safeReportFilename("***")).toBe("estudo");
    expect(printableMetric(NaN)).toBe("—");
    expect(printableMetric(Infinity)).toBe("—");
    expect(printableMetric(0.12345)).toBe("0.123");
  });
});

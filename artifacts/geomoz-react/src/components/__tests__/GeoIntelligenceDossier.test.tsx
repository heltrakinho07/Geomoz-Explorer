import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GeoIntelligenceDossier, type IntelligenceDossier } from "../GeoIntelligenceDossier";

const dossier: IntelligenceDossier = {
  version: "1.0", id: "test", generatedAt: "2026-11-04T00:00:00Z", status: "partial",
  scope: { province: "Manica" }, period: { startDate: "2025-01-01", endDate: "2026-01-01" },
  successfulTools: 1, failedTools: 1, limitations: ["Sem cobertura válida"],
  evidence: [{ id: "evidence_1", tool: "calculate_index", status: "success",
    parameters: { index: "ndvi" }, result: { mean: 0 } },
    { id: "evidence_2", tool: "calculate_slope", status: "error",
      parameters: {}, source: "<img src=x onerror=alert(1)>", result: { message: "Sem dados" } }],
};

describe("GeoIntelligenceDossier", () => {
  it("shows partial status, missing provenance and real zero values", () => {
    const html = renderToStaticMarkup(<GeoIntelligenceDossier dossier={dossier} />);
    expect(html).toContain("Resultados parciais");
    expect(html).toContain("Manica");
    expect(html).toContain("Não comunicada pela ferramenta");
    expect(html).toContain("Sem cobertura válida");
    expect(html).toContain("0");
    expect(html).toContain("Exportar dossiê JSON");
  });
  it("charts calculated temporal-change areas and preserves zero and negative values", () => {
    const html = renderToStaticMarkup(<GeoIntelligenceDossier dossier={{
      ...dossier, evidence: [{ ...dossier.evidence[0], tool: "detect_temporal_change",
        result: { index: "ndvi", threshold: 0.2, increaseAreaKm2: 0, decreaseAreaKm2: 174.48,
          stats: { min: -0.4, mean: -0.0128, max: 0.3 } } }],
    }} />);
    expect(html).toContain("Gráficos da análise");
    expect(html).toContain("Aumento ≥ 0,2");
    expect(html).toContain("174,48");
    expect(html).toContain("-0,0128");
  });
  it("uses the WorldCover map colour and offers statistics export", () => {
    const html = renderToStaticMarkup(<GeoIntelligenceDossier dossier={{
      ...dossier, evidence: [{ ...dossier.evidence[0], tool: "get_public_landcover",
        result: { classes: [{ id: 80, name: "Água permanente", areaKm2: 19.19,
          color: "#0064c8", percentOfValidArea: 0.1 }] } }],
    }} />);
    expect(html).toContain("background-color:#0064c8");
    expect(html).toContain("Água permanente");
    expect(html).toContain("Exportar CSV");
  });
  it("does not chart numeric fields from failed tools", () => {
    const html = renderToStaticMarkup(<GeoIntelligenceDossier dossier={{
      ...dossier, evidence: [{ ...dossier.evidence[1], result: { classes: [{ name: "Culturas", areaKm2: 10 }] } }],
    }} />);
    expect(html).not.toContain("Gráficos da análise");
  });
  it("escapes external source text", () => {
    const html = renderToStaticMarkup(<GeoIntelligenceDossier dossier={dossier} />);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

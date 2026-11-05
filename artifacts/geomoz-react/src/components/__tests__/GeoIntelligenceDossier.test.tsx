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
  it("escapes external source text", () => {
    const html = renderToStaticMarkup(<GeoIntelligenceDossier dossier={dossier} />);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANALYSIS_CONTROL_MESSAGES, analysisControlText } from "./analysisControls";

describe("GeoAnalises GEE processing localization", () => {
  it("has complete PT/EN/ES/FR labels and English fallback", () => {
    expect(Object.keys(ANALYSIS_CONTROL_MESSAGES).length).toBeGreaterThanOrEqual(35);
    for (const [key, labels] of Object.entries(ANALYSIS_CONTROL_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      labels.forEach(label => expect(label.trim(), key).not.toBe(""));
    }
    expect(analysisControlText("pt-MZ", "gee.parameters")).toBe("Parâmetros GEE");
    expect(analysisControlText("en", "run.start")).toBe("Run analysis");
    expect(analysisControlText("es", "gee.timeout")).toBe("Tiempo límite de espera");
    expect(analysisControlText("fr", "sidebar.closeFilters")).toBe("Fermer les filtres");
    expect(analysisControlText("de", "legend")).toBe("Legend");
  });
  it("keeps scientific IDs, GEE processing modes and request parameters", () => {
    const src=readFileSync(resolve(process.cwd(), "src/pages/GeoAnalises.tsx"), "utf8");
    for (const name of [
      "scienceUiText(language, key)",
      "analysisControlText(language, key)",
      'processing_mode: processingMode',
      'cloud_pct: geeCloudPct',
      'start_date: geeStartDate',
      'end_date: geeEndDate',
      'analysisT("gee.advanced")',
      'analysisT("gee.mode.scope")',
      'analysisT("run.progressHint")',
      'analysisT("sidebar.studyArea")',
    ]) expect(src, name).toContain(name);
  });
});

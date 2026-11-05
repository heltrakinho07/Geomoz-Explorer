import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HYDROLOGY_RESULT_MESSAGES, hydrologyResultText } from "./hydrologyResults";

const source = readFileSync(resolve(process.cwd(), "src/pages/HidroGeoMoz.tsx"), "utf8");

describe("GeoMoz Hydrology results and dialog localization", () => {
  it("provides reviewed text in all four languages, with English fallback", () => {
    expect(Object.keys(HYDROLOGY_RESULT_MESSAGES).length).toBeGreaterThanOrEqual(125);
    for (const [key, labels] of Object.entries(HYDROLOGY_RESULT_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      for (const label of labels) expect(label.trim(), key).not.toBe("");
    }
    expect(hydrologyResultText("pt-MZ", "share.title")).toBe("Partilhar análise (WebGIS)");
    expect(hydrologyResultText("en", "pdf.generate")).toBe("Generate A4 PDF");
    expect(hydrologyResultText("es", "result.basinMorphometry")).toBe("Morfometría de la cuenca");
    expect(hydrologyResultText("fr", "archive.load")).toBe("Charger sur la carte");
    expect(hydrologyResultText("de", "share.copy")).toBe("Copy");
  });

  it("references only keys defined in the localized results catalog", () => {
    const keys = Array.from(source.matchAll(/\bht\("([^"]+)"\)/g), match => match[1]);
    expect(keys.length).toBeGreaterThan(90);
    for (const key of keys) expect(HYDROLOGY_RESULT_MESSAGES, key).toHaveProperty(key);
  });

  it("retains unchanged hydrological request, shared-data and export contracts", () => {
    for (const contract of [
      "HydroRequestGuard",
      "watershedData.geojson",
      "setReportLayer(",
      "setPdfExportType(",
      "generateBasinReportPdf(pdfExportType)",
      "handleShareWebGis",
      "downloadStandaloneBasinHtml",
      "hydrologyResultText(translatedLocale, key)",
      "toLocaleDateString(numberLocale",
      "riskLabel(eff, language)",
    ]) expect(source, contract).toContain(contract);
  });

  it("keeps the UI terminology responsive without translating saved payloads", () => {
    expect(source).toContain('ht("result.tabs.morphometry")');
    expect(source).toContain('ht("result.riskPotential")');
    expect(source).toContain('ht("share.title")');
    expect(source).toContain('ht("pdf.title")');
    expect(source).toContain('ht("archive.title")');
    expect(source).toContain("saveAnalysis");
  });
});

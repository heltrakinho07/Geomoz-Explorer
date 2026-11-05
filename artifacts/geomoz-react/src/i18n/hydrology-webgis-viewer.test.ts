import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HYDROLOGY_RESULT_MESSAGES, hydrologyResultText } from "./hydrologyResults";

const source = readFileSync(resolve(process.cwd(), "src/pages/HidroWebGisViewer.tsx"), "utf8");

describe("Hydrology shared WebGIS viewer and generated cartographic PDF localization", () => {
  it("provides four reviewed locales and safe English fallback", () => {
    expect(Object.keys(HYDROLOGY_RESULT_MESSAGES).length).toBeGreaterThanOrEqual(190);
    for (const [key, labels] of Object.entries(HYDROLOGY_RESULT_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      for (const label of labels) expect(label.trim(), key).not.toBe("");
    }
    expect(hydrologyResultText("pt-MZ", "viewer.notFound")).toBe("Análise não encontrada");
    expect(hydrologyResultText("en", "pdfContent.reportTitle")).toContain("Basin hydro-environmental report");
    expect(hydrologyResultText("es", "viewer.layers")).toBe("Capas:");
    expect(hydrologyResultText("fr", "pdfContent.legendCN")).toContain("RUISSELLEMENT");
    expect(hydrologyResultText("de", "viewer.tabGeneral")).toBe("Overview");
  });
  it("references defined translation keys from the actual exported viewer", () => {
    const keys = Array.from(source.matchAll(/\bht\("([^"]+)"\)/g), match => match[1]);
    expect(keys.length).toBeGreaterThanOrEqual(105);
    for (const key of keys)
      expect(Object.prototype.hasOwnProperty.call(HYDROLOGY_RESULT_MESSAGES, key), key).toBe(true);
  });
  it("preserves shared analysis payloads, map tiles and export functionality", () => {
    for (const contract of [
      "decodeSharePayload",
      "renderBasinMapToDataUrl",
      "fetchMapImage",
      "new jsPDF(",
      "setExportType(",
      "report.landcoverTile",
      "report.runoff.cnTile",
      "downloadStandaloneBasinHtml",
      'hydrologyResultText(translatedLocale, key)',
    ]) expect(source, contract).toContain(contract);
  });
  it("uses locale-aware quantities and month names and removes fake numeric scales", () => {
    expect(source).toContain("toLocaleString(numberLocale)");
    expect(source).toContain("toLocaleDateString(numberLocale");
    expect(source).toContain("new Intl.DateTimeFormat(numberLocale");
    expect(source).toContain('ht("pdfContent.scale")');
    expect(source).not.toContain("Escala 1:Bacia");
    expect(hydrologyResultText("en", "pdfContent.scale")).not.toMatch(/1:basin/);
    expect(source).toContain('ht("pdfContent.metadata")');
    expect(source).toContain('ht("pdfContent.mapLulc")');
    expect(source).toContain('ht("pdfContent.mapCN")');
  });
});

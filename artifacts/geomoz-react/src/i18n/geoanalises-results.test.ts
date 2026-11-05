import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GEOANALISES_RESULT_MESSAGES, geoAnalisesResultText } from "./geoAnalisesResults";

const source = readFileSync(resolve(process.cwd(), "src/pages/GeoAnalises.tsx"), "utf8");

describe("GeoMoz GeoAnalises scientific results and PDF locale", () => {
  it("has complete PT/EN/ES/FR labels and falls back to English", () => {
    expect(Object.keys(GEOANALISES_RESULT_MESSAGES).length).toBeGreaterThanOrEqual(88);
    for (const [key, translations] of Object.entries(GEOANALISES_RESULT_MESSAGES)) {
      expect(translations, key).toHaveLength(4);
      for (const translation of translations) expect(translation.trim(), key).not.toBe("");
    }
    expect(geoAnalisesResultText("pt-MZ", "analysis.statsTitle")).toBe("Métricas geoestatísticas");
    expect(geoAnalisesResultText("en", "pdf.title")).toBe("Analysis report");
    expect(geoAnalisesResultText("es", "analysis.median")).toBe("Mediana (P50)");
    expect(geoAnalisesResultText("fr", "project.saved")).toBe("Analyse enregistrée avec succès !");
    expect(geoAnalisesResultText("de", "overlay.results")).toBe("Results");
  });

  it("uses only defined keys in dashboard, land cover and map overlays", () => {
    const names = [...source.matchAll(/(?:\brT|\bresultT)\("([^"]+)"\)/g)].map(m => m[1]);
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) {
      expect(Object.prototype.hasOwnProperty.call(GEOANALISES_RESULT_MESSAGES, name), name).toBe(true);
    }
  });

  it("does not change Google Earth Engine payload, scientific IDs, legend and export paths", () => {
    for (const contract of [
      "/geomoz-api/gee/landcover",
      "stats.p10", "stats.p90",
      "getGeometryCenter",
      "scienceUiText(language, key)",
      "analysisControlText(language, key)",
      "geoAnalisesResultText(language, key)",
      "createPDFContext(",
      "drawCover(ctx,",
      "fetchMapImage(",
      "addMapImage(ctx,",
      "ctx.doc.save(",
      "saveRunToActiveProject({",
      "landCoverTile?.classes?.map(",
    ]) {
      expect(source, contract).toContain(contract);
    }
  });

  it("localizes generated cover headings and numeric zonal metrics", () => {
    expect(source).toContain('resultT("pdf.title")');
    expect(source).toContain('resultT("pdf.mapTitle")');
    expect(source).toContain('rT("analysis.statsTitle")');
    expect(source).toContain('rT("landcover.legend")');
    expect(source).toContain('rT("project.saved")');
    expect(source).toContain('resultT("overlay.topoProfile")');
    expect(source).toContain("stats.areaKm2.toLocaleString(numberLocale)");
    expect(source).toContain("result.totalKm2.toLocaleString(numberLocale");
  });
});

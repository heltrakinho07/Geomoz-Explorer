import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ANALYSIS_CATEGORY_TRANSLATIONS, localizeAnalysisCategories } from "./analysis-catalog";
import { SPECIALIST_UI_CATALOGS, specialistText } from "./specialist-ui";

const sourceCategory = [{
  id: "terrain", title: "Relevo, Topografia & Morfologia",
  subtitle: "DEM Copernicus GLO-30 · 30 m", badge: "DEM Copernicus 30m",
  description: "Perfil topográfico (A→B)", highlights: ["Relevo", "Curvas"],
  tabIds: ["elevation", "contours"], defaultTab: "elevation", status: "ready",
}];

describe("GeoMoz specialist UI translations", () => {
  it("has matching reviewed keys for all four languages", () => {
    const keys = Object.keys(SPECIALIST_UI_CATALOGS.pt).sort();
    expect(keys.length).toBeGreaterThanOrEqual(139);
    for (const locale of ["en", "es", "fr"] as const) {
      expect(Object.keys(SPECIALIST_UI_CATALOGS[locale]).sort()).toEqual(keys);
      for (const key of keys) {
        expect(SPECIALIST_UI_CATALOGS[locale][key as keyof typeof SPECIALIST_UI_CATALOGS.pt].trim()).not.toBe("");
      }
    }
  });

  it("has complete and internally consistent category translations", () => {
    const ids = ["terrain", "geology", "vegetation", "water", "fire", "climate", "satellite", "urban"];
    for (const lang of ["en", "es", "fr"] as const) {
      expect(Object.keys(ANALYSIS_CATEGORY_TRANSLATIONS[lang]).sort()).toEqual([...ids].sort());
      for (const id of ids) {
        const copy = ANALYSIS_CATEGORY_TRANSLATIONS[lang][id as keyof typeof ANALYSIS_CATEGORY_TRANSLATIONS.en];
        expect(copy.title.length).toBeGreaterThan(5);
        expect(copy.description.length).toBeGreaterThan(35);
        expect(copy.highlights.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("localizes category labels and search text but never workflow IDs, source data or input", () => {
    const input = structuredClone(sourceCategory);
    for (const language of ["en", "es", "fr", "de"]) {
      const result = localizeAnalysisCategories(language, input);
      expect(result[0].id).toBe("terrain");
      expect(result[0].tabIds).toEqual(["elevation", "contours"]);
      expect(result[0].defaultTab).toBe("elevation");
      expect(result[0].status).toBe("ready");
      expect(result[0].title).not.toBe(input[0].title);
    }
    expect(input).toEqual(sourceCategory);
    const pt = localizeAnalysisCategories("pt-MZ", input);
    expect(pt).toEqual(sourceCategory);
  });

  it("keeps English fallback for GIS-only locales, not misleading Portuguese text", () => {
    expect(specialistText("en", "hydro.loadBasins")).toBe("Load watersheds");
    expect(specialistText("es", "analysis.heading")).toBe("¿Qué desea analizar?");
    expect(specialistText("fr", "processing.projectStorage")).toBe("Projet et stockage local");
    expect(specialistText("ar", "agent.send")).toBe("Send message");
    expect(specialistText("de-DE", "analysis.group.terrain")).toBe("Terrain & morphology");
  });

  it("connects all specialist main screens to reactive shared locale", () => {
    const files = [
      "../pages/GeoAnalises.tsx",
      "../pages/HidroGeoMoz.tsx",
      "../pages/GeoProcessamento.tsx",
      "../components/GeoMozAIAgentTab.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).toContain("usePortalTranslation()");
      expect(source).toContain("specialistText(translatedLocale, key)");
    }
    const analysis = readFileSync(new URL("../pages/GeoAnalises.tsx", import.meta.url), "utf8");
    expect(analysis).toContain("localizeAnalysisCategories(translatedLocale, GEO_CATEGORIES)");
    expect(analysis).toContain("[categoryFilter, categories]");
    expect(analysis).toContain("activeCategory.title");
  });
});

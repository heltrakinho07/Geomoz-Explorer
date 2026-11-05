import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GROUNDWATER_MESSAGES,
  groundwaterText,
  groundwaterClassLabel,
  groundwaterFactorLabel,
} from "./groundwater";

describe("GeoMoz groundwater AHP localization", () => {
  it("has complete PT, EN, ES and FR catalogs with English fallback", () => {
    expect(Object.keys(GROUNDWATER_MESSAGES).length).toBeGreaterThanOrEqual(45);
    for (const [key, labels] of Object.entries(GROUNDWATER_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      for (const label of labels) expect(label.trim(), key).not.toBe("");
    }
    expect(groundwaterText("pt-MZ", "title")).toBe("Água Subterrânea");
    expect(groundwaterText("en", "calculate")).toBe("Calculate potential");
    expect(groundwaterText("es", "filters")).toBe("Filtros");
    expect(groundwaterText("fr", "pdf.totalArea")).toBe("Surface totale");
    expect(groundwaterText("de", "title")).toBe("Groundwater");
  });

  it("translates only matching canonical scientific metadata and preserves unknown data", () => {
    expect(groundwaterClassLabel("en", 1, "Muito baixo")).toBe("Very low");
    expect(groundwaterClassLabel("fr", 5, "Muito alto")).toBe("Très élevé");
    expect(groundwaterClassLabel("es", 3, "Moderado")).toBe("Moderado");
    expect(groundwaterClassLabel("en", 1, "Custom scientific class")).toBe("Custom scientific class");
    expect(groundwaterClassLabel("en", 99, "Inconnu")).toBe("Inconnu");
    expect(groundwaterFactorLabel("en", "lineament", "Densidade de lineamentos")).toBe("Lineament density");
    expect(groundwaterFactorLabel("fr", "twi", "Índice de humidade (TWI)")).toContain("TWI");
    expect(groundwaterFactorLabel("en", "twi", "Custom TWI factor")).toBe("Custom TWI factor");
    expect(groundwaterFactorLabel("en", "new_factor", "Observational metric")).toBe("Observational metric");
  });

  it("keeps GEE request identifiers, raw geometry, parameters and numeric AHP measures", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/AguaSubterranea.tsx"), "utf8");
    expect(source).toContain('apiFetch("/geomoz-api/gee/groundwater"');
    expect(source).toContain("body: JSON.stringify({ ...aoiToAPI(aoi), year })");
    expect(source).toContain('w.favours === "alto"');
    expect(source).toContain("groundwaterClassLabel(translatedLocale, c.id, c.label)");
    expect(source).toContain("groundwaterFactorLabel(translatedLocale, w.key, w.label)");
    expect(source).toContain('g("pdf.reportTitle")');
    expect(source).toContain('g("error.title")');
    expect(source).toContain("[aoi, year, g, toast]");
    expect(source).toContain("aoiToMapBounds(aoi)");
  });
});

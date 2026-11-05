import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HYDROLOGY_MESSAGES, hydrologyText } from "./hydrology";

describe("HydroGeoMoz reactive localization", () => {
  it("covers PT, EN, ES, FR and other-language fallback", () => {
    expect(Object.keys(HYDROLOGY_MESSAGES).length).toBeGreaterThanOrEqual(50);
    for (const [key, labels] of Object.entries(HYDROLOGY_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      labels.forEach(label => expect(label.trim(), key).not.toBe(""));
    }
    expect(hydrologyText("pt-MZ", "title")).toBe("Bacias Hidrográficas");
    expect(hydrologyText("en", "mode.delineate")).toBe("Delineate");
    expect(hydrologyText("es", "drainage")).toBe("Red de drenaje");
    expect(hydrologyText("fr", "delineate.outlet")).toBe("Point (exutoire)");
    expect(hydrologyText("de", "rivers.generate")).toBe("Generate streams");
  });
  it("does not translate data identifiers or alter watershed parameters", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/HidroGeoMoz.tsx"), "utf8");
    for (const literal of [
      "HydroRequestGuard",
      '"delineate"',
      '"explore"',
      "HydroBASINS",
      "Pfafstetter",
      "aoiToAPI(aoi)",
      'h("delineate.levelHint")',
      'h("basins.levelPoint")',
      'h("rivers.generate")',
      "usePortalTranslation()",
    ]) expect(src, literal).toContain(literal);
    expect(src).toContain("toLocaleString(numberLocale)");
  });
});

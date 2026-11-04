import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TERRAIN_MESSAGES, TERRAIN_STAGES, terrainStageText, terrainText } from "./terrain";

describe("GeoMoz terrain workflow localization", () => {
  it("has complete reviewed PT/EN/ES/FR entries and English fallback for other GeoLibre languages", () => {
    expect(Object.keys(TERRAIN_MESSAGES).length).toBeGreaterThan(55);
    for (const [key, entries] of Object.entries(TERRAIN_MESSAGES)) {
      expect(entries, key).toHaveLength(4);
      entries.forEach(value => expect(value.trim(), key).not.toBe(""));
    }
    expect(terrainText("en", "action.run")).toBe("Run complete analysis");
    expect(terrainText("es", "action.run")).toBe("Ejecutar análisis completo");
    expect(terrainText("fr", "action.cancel")).toBe("Annuler");
    expect(terrainText("de", "action.run")).toBe("Run complete analysis");
    expect(terrainText("pt-MZ", "action.run")).toBe("Executar análise completa");
  });

  it("interpolates numbers without modifying resolution values and localizes worker stages only for display", () => {
    expect(terrainText("en", "note.resAdjusted", { actual: 60, requested: 30 })).toContain("60 m rather than 30 m");
    expect(terrainStageText("fr", "Declividade")).toBe("Pente");
    expect(terrainStageText("en", "Bacias de drenagem nas bordas")).toBe("Edge drainage basins");
    expect(terrainStageText("fr", "My custom surface")).toBe("My custom surface");
    for (const key of Object.values(TERRAIN_STAGES)) expect(TERRAIN_MESSAGES[key]).toHaveLength(4);
  });

  it("uses existing stable DEM/GEE paths, numeric model options and keyed UI copy", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/TerrainWorkflowPanel.tsx"), "utf8");
    for (const match of src.matchAll(/\btr\("([^"]+)"/g)) {
      expect(Object.prototype.hasOwnProperty.call(TERRAIN_MESSAGES, match[1]), match[1]).toBe(true);
    }
    for (const preserved of ['"/geomoz-api/gee/download-url"', 'index: "elevation"', 'elevationUnit:', 'streamAreaKm2', 'runTerrainWorkflow(bytes, name, params', 'downloadTerrainBlob', 'exportTerrainPng', 'exportTerrainPdf']) {
      expect(src).toContain(preserved);
    }
    expect(src).toContain("terrainStageText(language, product.name)");
  });
});

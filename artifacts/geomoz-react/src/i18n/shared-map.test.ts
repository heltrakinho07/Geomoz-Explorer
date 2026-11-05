import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHARED_MAP_MESSAGES, sharedMapText } from "./sharedMap";

describe("Shared GeoMoz map UI localization", () => {
  it("has reviewed PT, EN, ES and FR labels for every shared surface", () => {
    expect(Object.keys(SHARED_MAP_MESSAGES).length).toBeGreaterThan(85);
    for (const [key, labels] of Object.entries(SHARED_MAP_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      for (const label of labels) expect(label.trim(), key).not.toBe("");
    }
    expect(sharedMapText("en", "zone.define")).toBe("Define study area");
    expect(sharedMapText("es", "basemap.layers")).toBe("Capas");
    expect(sharedMapText("fr", "explorer.hazards.title")).toBe("Géorisques et dangers");
    expect(sharedMapText("de", "zone.draw")).toBe("Draw polygon");
    expect(sharedMapText("pt-MZ", "explorer.print")).toBe("Layout de impressão");
  });

  it("uses translation keys in the reusable AOI selector and keeps geometry unchanged", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/ZoneSelect.tsx"), "utf8");
    for (const key of ['zone.global', 'zone.upload', 'zone.draw', 'zone.importHelp']) {
      expect(src).toContain(`copy("${key}")`);
    }
    expect(src).toContain("computeAOIMetrics(aoi.geometry)");
    expect(src).toContain('customAOI(geojson, label, "upload")');
    expect(src).toContain("onDrawingRequest?.()");
  });

  it("retains basemap IDs, module routes and GIS command action IDs", () => {
    const basemaps = readFileSync(resolve(process.cwd(), "src/components/BasemapSwitcher.tsx"), "utf8");
    const explorer = readFileSync(resolve(process.cwd(), "src/pages/Explorer.tsx"), "utf8");
    for (const id of ["roadmap", "satellite", "terrain", "hybrid", "cesium"]) {
      expect(basemaps).toContain(`id: "${id}"`);
    }
    for (const id of ["import-project", "save-device", "add-file", "download-dem", "processing", "layers"]) {
      expect(explorer).toContain(`"${id}"`);
    }
    expect(basemaps).toContain("copy(opt.labelKey)");
    expect(explorer).toContain('copy("explorer.hazards.title")');
    expect(explorer).toContain('copy("explorer.print")');
  });
});

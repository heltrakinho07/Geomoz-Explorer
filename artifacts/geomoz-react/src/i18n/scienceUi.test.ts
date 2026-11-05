import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCIENCE_UI_MESSAGES, scienceUiText } from "./scienceUi";

describe("GeoMoz scientific UI internationalization", () => {
  it("keeps all 56 keys populated in PT EN ES FR", () => {
    const keys = Object.keys(SCIENCE_UI_MESSAGES.pt).sort();
    expect(keys.length).toBe(56);
    for (const lang of ["en","es","fr"] as const) {
      expect(Object.keys(SCIENCE_UI_MESSAGES[lang]).sort()).toEqual(keys);
      for (const key of keys) {
        expect(SCIENCE_UI_MESSAGES[lang][key as keyof typeof SCIENCE_UI_MESSAGES.pt].trim()).not.toBe("");
      }
    }
  });
  it("keeps the stable scientific copy independent from the GEE runtime", () => {
    for (const locale of ["pt","en","es","fr"] as const) {
      const text = SCIENCE_UI_MESSAGES[locale];
      expect(text["catalog.search"]).not.toBe(text["catalog.searchHint"]);
      expect(text["catalog.moduleStatus"]).not.toBe(text["catalog.open"]);
      expect(text["overview.error"]).not.toBe(text["overview.processing"]);
    }
  });
  it("translates visible scientific actions and keeps GIS-only fallback English", () => {
    expect(scienceUiText("en","catalog.title")).toBe("What would you like to analyse?");
    expect(scienceUiText("es","catalog.compare")).toBe("Comparar períodos");
    expect(scienceUiText("fr","overview.processing")).toBe("Traitement en cours…");
    expect(scienceUiText("pt-MZ","overview.title")).toBe("Da área de estudo ao resultado.");
    expect(scienceUiText("de","catalog.title")).toBe("What would you like to analyse?");
    expect(scienceUiText("ar","overview.draw")).toBe("Draw on map");
  });
  it("wires GeoAnalyses catalog to translated controls without changing scientific indices or command ids", () => {
    const src = readFileSync(resolve(process.cwd(),"src/pages/GeoAnalises.tsx"),"utf8");
    for(const key of ["catalog.title","catalog.description","catalog.search","catalog.searchHint","catalog.compare","catalog.open","catalog.development","catalog.choose","catalog.export","catalog.runFirst"]){
      expect(src).toContain('scienceT("'+key+'")');
    }
    expect(src).toContain('setSelectedCategory(cat.id)');
    expect(src).toContain('setActiveTab(cat.defaultTab)');
    expect(src).toContain('SCIENCE[tabId]?.status === "experimental"');
  });
  it("wires Workspace overview raster and DEM status without altering operations", () => {
    const src = readFileSync(resolve(process.cwd(),"src/components/GISWorkspaceOverview.tsx"),"utf8");
    for(const key of ["overview.title","overview.draw","overview.import","overview.terrain","overview.sourceGrid","overview.processing","overview.error","overview.view"]){
      expect(src).toContain('t("'+key+'")');
    }
    for(const cb of ["onDraw","onImport","onTerrain","onLayers"])expect(src).toContain("onClick={"+cb+"}");
  });
});

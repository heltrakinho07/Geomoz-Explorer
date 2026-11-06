import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAnalysisSidebarConfig } from "@/lib/geoanalises-sidebar-config";

const page = readFileSync(resolve(process.cwd(), "src/pages/GeoAnalises.tsx"), "utf8");

describe("GeoAnálises: contextual sidebar settings", () => {
  it("allows observation dates and a scene cloud filter for optical NDVI", () => {
    expect(getAnalysisSidebarConfig("ndvi", "spectral")).toMatchObject({
      showDateRange: true,
      showCloudFilter: true,
      showProcessingOptions: true,
      requiresGee: true,
    });
    expect(getAnalysisSidebarConfig("fe_oxide_l8", "minerals").title).toBe("Assinatura mineral");
    expect(getAnalysisSidebarConfig("ndwi", "water").title).toBe("Índices de água");
  });

  it.each(["elevation", "hipsometry", "topo_class", "topo_custom", "profile", "contours", "lineaments"])(
    "omits irrelevant date and cloud filters for %s",
    tab => {
      const config = getAnalysisSidebarConfig(tab, "terrain");
      expect(config.showDateRange).toBe(false);
      expect(config.showCloudFilter).toBe(false);
    }
  );

  it("keeps categories with their own controls separate from scene filters", () => {
    for (const tab of ["landcover", "spi_ndvi", "targeting"]) {
      const config = getAnalysisSidebarConfig(tab);
      expect(config.showDateRange).toBe(false);
      expect(config.showCloudFilter).toBe(false);
      expect(config.showProcessingOptions).toBe(false);
    }
    expect(getAnalysisSidebarConfig("landcover").source).toBe("WorldCover 2021");
  });

  it("distinguishes external annual mosaics from GEE imagery", () => {
    expect(getAnalysisSidebarConfig("s2")).toMatchObject({
      requiresGee: false, showDateRange: false, showCloudFilter: false,
      showProcessingOptions: false,
    });
  });

  it("keeps the fire pre/post dates while ignoring a MODIS scene cloud slider", () => {
    expect(getAnalysisSidebarConfig("dnbr", "fire").showCloudFilter).toBe(true);
    expect(getAnalysisSidebarConfig("burned_area", "fire")).toMatchObject({
      showDateRange: true, showCloudFilter: false,
    });
    expect(getAnalysisSidebarConfig("forest_loss", "fire").showDateRange).toBe(false);
  });

  it("does not expose optical cloud filters for climatic products", () => {
    for (const tab of ["precipitation", "temperature_lst", "spei", "vci", "tci", "vhi", "cyclone_tracks"]) {
      expect(getAnalysisSidebarConfig(tab, "climate").showCloudFilter).toBe(false);
    }
  });

  it("routes specialist analyses through their own parameter panels", () => {
    for (const tab of ["s2", "profile", "contours", "topo_custom", "landcover", "targeting", "spi_ndvi"]) {
      expect(getAnalysisSidebarConfig(tab).useSpecializedPanel).toBe(true);
    }
    expect(getAnalysisSidebarConfig("ndvi", "spectral").useSpecializedPanel).toBe(false);
    expect(page).toContain("sidebarConfig.useSpecializedPanel");
    expect(page).toContain("Abrir ferramentas específicas");
  });

  it("renders the correct controls according to the active index", () => {
    expect(page).toContain("getAnalysisSidebarConfig(activeTab");
    expect(page).toContain("sidebarConfig.showDateRange && (");
    expect(page).toContain("sidebarConfig.showCloudFilter && (");
    expect(page).toContain("sidebarConfig.showProcessingOptions && (");
    expect(page).toContain("sidebarConfig.requiresGee && (");
    expect(page).toContain('data-testid="analysis-method-description"');
  });

  it("uses exactly one raster ramp in the map and removes the duplicate ramps", () => {
    expect(page.match(/<ColormapLegend index=/g)).toHaveLength(1);
    expect(page).toContain('data-testid="geoanalises-map-legend"');
    expect(page).toContain("palette={geeTile.vis?.palette}");
    expect(page).not.toContain('rT("analysis.spectralScale")');
    expect(page).not.toContain("Legenda do Índice Selecionado na Sidebar");
    expect(page).not.toContain("Escala — favorabilidade</h4>");
    expect(page).not.toContain("Colormap legend — always visible");
  });

  it("preserves the categorical legends and fire-severity classes", () => {
    expect(page).toContain('activeTab === "landcover"');
    expect(page).toContain('activeTab === "burn_severity"');
    expect(page).toContain("topoClassesTile.labels.map");
    expect(page).toContain("landCoverTile.classes.map");
    expect(page).toContain('data-testid="geoanalises-worldcover-map-legend"');
    expect(page).toContain("!showSpiChart && !resultsPanelOpen");
  });
});

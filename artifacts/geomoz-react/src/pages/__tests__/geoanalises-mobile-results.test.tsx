import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import DraggablePanel from "@/components/DraggablePanel";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const analytics = read("src/pages/GeoAnalises.tsx");
const catalogStyles = read("src/pages/geoanalises-catalog.css");
const panel = read("src/components/DraggablePanel.tsx");
const shell = read("src/pages/Explorer.tsx");

describe("GeoAnálises: scroll and responsive inspector", () => {
  it("renders a separately scrollable inspector with accessible hide control", () => {
    const html = renderToStaticMarkup(
      <DraggablePanel title="Análise: NDVI" onClose={() => {}}>
        <article>414 cenas Sentinel-2 · NDVI 0,308</article>
      </DraggablePanel>
    );
    expect(html).toContain('data-testid="geo-analysis-results-panel"');
    expect(html).toContain('data-testid="geo-analysis-results-scroll"');
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("414 cenas Sentinel-2");
    expect(html).toContain('aria-label="Ocultar painel de análise"');
    expect(html).toContain("Análise: NDVI");
  });

  it("adapts the draggable inspector to the mobile viewport without disabling scroll", () => {
    expect(panel).toContain('window.innerWidth < 768');
    expect(panel).toContain('maxHeight: "min(78dvh, calc(100% - 12px))"');
    expect(panel).toContain("touch-pan-y overflow-y-auto overflow-x-hidden");
    expect(panel).toContain('style={{ WebkitOverflowScrolling: "touch" }}');
    expect(panel).toContain('mobile ? "rounded-t-2xl');
  });

  it("keeps computed results in page state when the inspector is hidden and reopened", () => {
    expect(analytics).toContain("resultsPanelOpen && (activeDef");
    expect(analytics).toContain("onClose={() => setResultsPanelOpen(false)}");
    expect(analytics).toContain("setResultsPanelOpen(value => !value)");
    expect(analytics).toContain("setResultsPanelOpen(true)");
    expect(analytics).toContain('aria-label={ui("analysis.showPanel")}');
    expect(analytics).not.toContain("setGeeTile(null);\n    setResultsPanelOpen(false)");
  });

  it("shows full scientific index names in the sidebar and mobile selection", () => {
    expect(analytics).toContain('savi: "Índice de Vegetação Ajustado ao Solo"');
    expect(analytics).toContain('evi: "Índice de Vegetação Melhorado"');
    expect(analytics).toContain('ndvi: "Índice de Vegetação por Diferença Normalizada"');
    expect(analytics).toContain("descriptiveIndexName(tabId)");
    expect(analytics).toContain("className=\"order-3 w-full min-w-0 sm:order-none sm:flex-1\"");
    expect(analytics).toContain("value={activeTab}");
  });

  it("fixes mobile filter drawer width and avoids static 100vh on smartphone shell", () => {
    expect(analytics).toContain("w-[min(94vw,26rem)]");
    expect(analytics).toContain('useState(false);\n  const [resultsPanelOpen');
    expect(analytics).toContain('aria-label={ui("analysis.openFilters")}');
    expect(shell).toContain("h-[100dvh]");
    expect(shell).toContain('aria-label={copy("explorer.openNav")}');
  });
});


describe("GeoAnálises: translucent category cards", () => {
  it("applies glassmorphism to all eight categories without replacing their actions", () => {
    expect(analytics).toContain('import "./geoanalises-catalog.css"');
    expect(analytics).toContain("data-category={cat.id}");
    expect(analytics).toContain('className="geo-catalog-card group');
    expect(analytics).toContain("setSelectedCategory(cat.id)");
    expect(analytics).toContain("setActiveTab(cat.defaultTab)");
    for (const category of [
      "terrain", "geology", "vegetation", "water",
      "fire", "climate", "satellite", "urban",
    ]) {
      expect(catalogStyles).toContain(`data-category="${category}"`);
    }
  });

  it("provides accessible contrast, keyboard focus, graceful blur fallback and reduced motion", () => {
    expect(analytics).toContain('aria-label={`${cat.status === "development"');
    expect(catalogStyles).toContain("backdrop-filter: blur(16px)");
    expect(catalogStyles).toContain(".geo-catalog-card:focus-visible");
    expect(catalogStyles).toContain("@supports not");
    expect(catalogStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(catalogStyles).toContain("data-geomoz-reduced-motion");
    expect(catalogStyles).toContain("@media (forced-colors: active)");
    expect(catalogStyles).toContain(".dark .geo-catalog-card");
    expect(catalogStyles).toContain("@media (max-width: 640px)");
  });

  it("retains scientific caveats and responsive highlighting without fake activation", () => {
    expect(analytics).toContain('className="geo-catalog-card__review"');
    expect(analytics).toContain('ui("analysis.review")');
    expect(analytics).toContain('cat.highlights.slice(0, 3)');
    expect(analytics).toContain('cat.status === "development" ? "Ver estado do módulo"');
    expect(analytics).toContain("geo-catalog-grid grid");
  });
});

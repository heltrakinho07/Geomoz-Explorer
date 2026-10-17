import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import DraggablePanel from "@/components/DraggablePanel";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const analytics = read("src/pages/GeoAnalises.tsx");
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
    expect(analytics).toContain('aria-label="Mostrar painel de resultados"');
    expect(analytics).not.toContain("setGeeTile(null);\n    setResultsPanelOpen(false)");
  });

  it("shows full scientific index names in the sidebar and mobile selection", () => {
    expect(analytics).toContain('savi: "Índice de Vegetação Ajustado ao Solo"');
    expect(analytics).toContain('evi: "Índice de Vegetação Melhorado"');
    expect(analytics).toContain('ndvi: "Índice de Vegetação por Diferença Normalizada"');
    expect(analytics).toContain("const label = descriptiveIndexName(tabId)");
    expect(analytics).toContain("className=\"order-3 w-full min-w-0 sm:hidden\"");
    expect(analytics).toContain("value={activeTab}");
  });

  it("fixes mobile filter drawer width and avoids static 100vh on smartphone shell", () => {
    expect(analytics).toContain("w-[min(88vw,22rem)]");
    expect(analytics).toContain('useState(false);\n  const [resultsPanelOpen');
    expect(analytics).toContain('aria-label="Abrir filtros e parâmetros"');
    expect(shell).toContain("h-[100dvh]");
    expect(shell).toContain('aria-label="Abrir menu de navegação"');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/DashboardPanel.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/components/dashboard-glass.css"), "utf8");

describe("GeoMoz Dashboard glassmorphism", () => {
  it("styles each part of the Dashboard without removing the underlying workflows", () => {
    expect(source).toContain('import "./dashboard-glass.css"');
    expect(source).toContain('className="gm-dashboard flex-1');
    expect(source).toContain('className="gm-dashboard-hero');
    expect(source).toContain("gm-dashboard-panel--active");
    expect(source).toContain("gm-dashboard-panel--empty");
    expect(source).toContain("gm-dashboard-switcher");
    expect(source).toContain("gm-dashboard-project-switch");
    expect(source).toContain("gm-dashboard-run");
    expect(source).toContain("gm-dashboard-metrics");
    expect(source).toContain("gm-dashboard-infra-note");
    expect(source).toContain("onOpenProjectModal");
    expect(source).toContain("onOpenSettings");
    expect(source).toContain("setActiveProject(p)");
    expect(source).toContain('onTabChange?.("GeoAnálises")');
  });

  it("keeps all seven real module launchers keyboard accessible", () => {
    for (const id of [
      "mapa", "geoanalises", "bacias", "agua_subterranea",
      "geoperigos", "geomoz_ai", "exportar",
    ]) {
      expect(source).toContain(`id: "${id}"`);
      expect(styles).toContain(`data-module="${id}"`);
    }
    expect(source).toContain("data-module={mod.id}");
    expect(source).toContain("t(mod.titleKey)");
    expect(source).toContain("t(mod.descriptionKey)");
    expect(source).toContain('aria-label={`${t("dashboard.openModule")}: ${t(mod.titleKey)}`}');
    expect(source).toContain("onClick={() => onTabChange?.(mod.tab)}");
    expect(source).toMatch(/<button\s+type="button"\s+key=\{mod.id\}/);
    expect(source).toContain("gm-dashboard-module__footer");
  });

  it("supports dark mode, focus navigation, mobile layout and accessibility fallbacks", () => {
    expect(styles).toContain(".dark .gm-dashboard");
    expect(styles).toContain("-webkit-backdrop-filter: blur(16px)");
    expect(styles).toContain("backdrop-filter: blur(16px)");
    expect(styles).toContain(".gm-dashboard-module:focus-visible");
    expect(styles).toContain(".gm-dashboard-project-switch:focus-visible");
    expect(styles).toContain("@supports not");
    expect(styles).toContain("@media (max-width: 640px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain('data-geomoz-reduced-motion="true"');
    expect(styles).toContain("@media (forced-colors: active)");
  });
});

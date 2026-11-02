import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sidebar = read("src/components/Sidebar.tsx");
const styles = read("src/components/sidebar-footer-actions.css");

describe("GeoMoz sidebar footer action dock", () => {
  it("keeps three footer actions within the sidebar at its minimum width", () => {
    expect(sidebar).toContain('import "./sidebar-footer-actions.css"');
    expect(sidebar).toContain('data-testid="sidebar-action-dock"');
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain("width: 100%");
    expect(styles).toContain("min-width: 0");
    expect(sidebar).toContain("overflow-y-auto overflow-x-hidden");
  });

  it("preserves dark mode, PWA installation and Settings callbacks", () => {
    expect(sidebar).toContain('data-testid="sidebar-theme-action"');
    expect(sidebar).toContain("onClick={toggleTheme}");
    expect(sidebar).toContain('data-testid="sidebar-install-action"');
    expect(sidebar).toContain("!isStandalone && canInstall && (");
    expect(sidebar).toContain("onClick={promptInstall}");
    expect(sidebar).toContain('data-testid="sidebar-settings-action"');
    expect(sidebar).toContain("onClick={onOpenSettings}");
    expect(sidebar).toContain("aria-pressed={isDark}");
    expect(sidebar).toContain('aria-label="Abrir definições do sistema"');
    expect(sidebar).toContain('aria-label="Instalar GeoMoz Explorer como aplicação"');
  });

  it("respects collapsed navigation, light/dark contrast and reduced motion", () => {
    expect(sidebar).toContain('gm-sidebar-action-dock--collapsed');
    expect(sidebar).toContain('gm-sidebar-action-dock--install');
    expect(sidebar).toContain("!collapsed && <span");
    expect(styles).toContain(".dark .gm-sidebar-action-dock");
    expect(styles).toContain(".gm-sidebar-action:focus-visible");
    expect(styles).toContain("@supports not");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain('data-geomoz-reduced-motion="true"');
    expect(styles).toContain("@media (forced-colors: active)");
  });
});

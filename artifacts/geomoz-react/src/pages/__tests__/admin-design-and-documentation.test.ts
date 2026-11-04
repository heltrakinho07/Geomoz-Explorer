import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const admin = read("src/pages/AdminConsole.tsx");
const adminStyles = read("src/pages/admin-geomoz.css");
const sidebar = read("src/components/Sidebar.tsx");
const settings = read("src/components/SettingsDialog.tsx");
const explorer = read("src/pages/Explorer.tsx");

describe("GeoMoz unified administrative identity", () => {
  it("uses the official Explorer logotype, dashboard glass style and theme", () => {
    expect(admin).toContain('import GeoMozBrandIcon from "@/components/GeoMozBrandIcon"');
    expect(admin).toContain('import "@/components/dashboard-glass.css"');
    expect(admin).toContain('import "./admin-geomoz.css"');
    expect(admin).toContain("<GeoMozBrandIcon");
    expect(admin).toContain("gm-dashboard-hero");
    expect(admin).toContain("gm-dashboard-panel");
    expect(admin).toContain("gm-sidebar");
    expect(admin).toContain("useGeoMozTheme()");
    expect(admin).toContain("onClick={toggleTheme}");
    expect(admin).toContain('data-geomoz-system="admin"');
  });

  it("preserves administrator permissions and every management section", () => {
    expect(admin).toContain('"/geomoz-api/admin/me"');
    expect(admin).toContain('"/geomoz-api/admin/plans"');
    expect(admin).toContain('"/geomoz-api/admin/payments?limit=80"');
    for (const id of ["overview", "users", "plans", "features", "payments", "audit"]) {
      expect(admin).toContain(`id: "${id}"`);
    }
  });

  it("supports clear, dark and reduced-motion responsive layouts", () => {
    expect(adminStyles).toContain(".gm-admin-sidebar");
    expect(adminStyles).toContain(".gm-admin-kpi");
    expect(adminStyles).toContain(".dark .gm-admin-sidebar");
    expect(adminStyles).toContain("max-width: 1023px");
    expect(adminStyles).toContain("prefers-reduced-motion: reduce");
    expect(adminStyles).toContain('data-geomoz-reduced-motion="true"');
  });
});

describe("GeoMoz documentation inside system settings", () => {
  it("removes the standalone sidebar link without deleting the documentation", () => {
    expect(sidebar).not.toContain('id: "Documentação", labelKey: "sidebar.nav.docs"');
    expect(explorer).toContain('activeTab === "Documentação"');
    expect(explorer).toContain("LazyDocumentation");
  });

  it("opens documentation through settings with a working internal route", () => {
    expect(settings).toContain('data-testid="settings-documentation-tab"');
    expect(settings).toContain('data-testid="settings-open-documentation"');
    expect(settings).toContain('href="/documentacao"');
    expect(settings).toContain('onClick={() => onOpenChange(false)}');
    expect(settings).toContain('activeTab === "documentation"');
    expect(explorer).toContain('path.includes("document")');
  });
});

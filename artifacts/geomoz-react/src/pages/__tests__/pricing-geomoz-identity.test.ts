import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const pricing = read("src/pages/PricingPage.tsx");
const pricingCss = read("src/pages/pricing-geomoz.css");
const admin = read("src/pages/AdminConsole.tsx");
const app = read("src/App.tsx");
const settings = read("src/components/SettingsDialog.tsx");
const sidebar = read("src/components/Sidebar.tsx");

describe("GeoMoz Explorer — unified plans experience", () => {
  it("reuses the official logo, dashboard design and global theme", () => {
    expect(pricing).toContain('import GeoMozBrandIcon from "@/components/GeoMozBrandIcon"');
    expect(pricing).toContain('import "@/components/dashboard-glass.css"');
    expect(pricing).toContain('import "./pricing-geomoz.css"');
    expect(pricing).toContain("gm-dashboard-hero");
    expect(pricing).toContain("gm-dashboard-panel");
    expect(pricing).toContain("useGeoMozTheme()");
    expect(pricing).toContain('data-geomoz-system="pricing"');
    expect(pricing).toContain("<GeoMozBrandIcon");
  });

  it("compares dynamic plan limits and prices, including monthly and yearly options", () => {
    expect(pricing).toContain('"/geomoz-api/billing/catalog"');
    expect(pricing).toContain("serverPlans[id]");
    expect(pricing).toContain("p.storageBytes");
    expect(pricing).toContain("p.credits");
    expect(pricing).toContain('aria-pressed={!annual}');
    expect(pricing).toContain('aria-pressed={annual}');
    expect(pricing).toContain('checkoutEnabled');
    expect(pricing).toContain('!checkoutEnabled && id !== "community" && id !== "enterprise"');
  });

  it("describes customer payment methods, not the gateway brand", () => {
    for (const text of ["M-Pesa", "e-Mola", "Cartão bancário", "sem renovação automática", "Pagamento seguro"]) {
      expect(pricing).toContain(text);
    }
    expect(pricing).not.toMatch(/Checkout PayZeno|Histórico de pagamentos PayZeno|Prosseguir para PayZeno|confirmado pelo PayZeno/i);
    expect(pricing).toContain('result.url.startsWith("https://checkout.payzeno.io/")');
    expect(pricing).toContain("window.location.assign(result.url)");
  });

  it("keeps accessible responsive layouts, reduced motion and styles", () => {
    expect(pricingCss).toContain(".gm-pricing-card");
    expect(pricingCss).toContain(".gm-pricing-payment-method");
    expect(pricingCss).toContain(".gm-pricing-checkout");
    expect(pricingCss).toContain(".dark .gm-pricing");
    expect(pricingCss).toContain("@media(max-width: 640px)");
    expect(pricingCss).toContain("prefers-reduced-motion: reduce");
    expect(pricingCss).toContain('data-geomoz-reduced-motion="true"');
    expect(pricingCss).toContain("@supports not");
  });
});

describe("GeoMoz native administration and documentation", () => {
  it("keeps admin in the unified identity", () => {
    expect(admin).toContain("<GeoMozBrandIcon");
    expect(admin).toContain('import "@/components/dashboard-glass.css"');
    expect(admin).toContain("gm-admin-sidebar");
  });

  it("moves docs from primary sidebar to settings, with real route", () => {
    expect(sidebar).not.toContain('id: "Documentação", labelKey: "sidebar.nav.docs"');
    expect(settings).toContain('data-testid="settings-documentation-tab"');
    expect(settings).toContain('data-testid="settings-open-documentation"');
    expect(settings).toContain('href="/documentacao"');
    expect(app).toContain('<Route path="/documentacao">');
  });
});

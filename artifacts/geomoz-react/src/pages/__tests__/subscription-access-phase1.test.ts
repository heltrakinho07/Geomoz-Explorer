import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

const settings = read("src/components/SettingsDialog.tsx");
const accessHook = read("src/hooks/useSubscriptionAccess.ts");

describe("Subscription & Access Engine — GeoMoz Settings", () => {
  it("reads signed-in account entitlements from the backend", () => {
    expect(accessHook).toContain('"/geomoz-api/billing/access"');
    expect(accessHook).toContain("apiFetch");
    expect(accessHook).not.toContain("POST");
    expect(accessHook).not.toContain("localStorage");
    expect(accessHook).toContain('user.uid === "guest_user"');
  });

  it("shows authoritative cloud quota and credit usage", () => {
    expect(settings).toContain('useSubscriptionAccess(open && activeTab === "billing")');
    expect(settings).toContain("verifiedAccess.usage.projectsUsed");
    expect(settings).toContain("verifiedAccess.usage.creditsUsed");
    expect(settings).toContain("verifiedAccess.usage.creditCycle");
    expect(settings).toContain("verifiedAccess.limits.concurrent_jobs");
    expect(settings).toContain("verifiedAccess.usage.storageUsedBytes");
    expect(settings).toContain("role=\"progressbar\"");
    expect(settings).toContain("A confirmar os limites");
  });

  it("does not claim externally owned Earth Engine quotas are included", () => {
    expect(settings).toContain("Análises GEE com credenciais próprias não consomem créditos GeoMoz");
    expect(settings).toContain("Quota de upload ainda não aplicada a todas as fontes");
    expect(settings).toContain("Limite actual por instância");
  });

  it("uses native GeoMoz blue controls, not a separate checkout portal", () => {
    expect(settings).toContain("from-sky-500 to-indigo-600");
    expect(settings).toContain('href="/planos"');
  });
});

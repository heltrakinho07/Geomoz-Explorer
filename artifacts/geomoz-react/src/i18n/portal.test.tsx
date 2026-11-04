// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import { PORTAL_CATALOGS, portalText, resolvedPortalLocale } from "./portal";
import { usePortalTranslation } from "./usePortalTranslation";

describe("GeoMoz portal catalogs", () => {
  it("has identical stable message keys across the four reviewed languages", () => {
    const baseline = Object.keys(PORTAL_CATALOGS.pt).sort();
    expect(baseline.length).toBeGreaterThan(85);
    for (const locale of ["en","es","fr"] as const) {
      expect(Object.keys(PORTAL_CATALOGS[locale]).sort()).toEqual(baseline);
      for (const key of baseline) {
        expect(PORTAL_CATALOGS[locale][key as keyof typeof PORTAL_CATALOGS.pt]).not.toBe("");
      }
    }
  });

  it("translates the same navigation, module and settings concepts without changing ids", () => {
    expect(portalText("en", "sidebar.nav.watersheds")).toBe("Watersheds");
    expect(portalText("es", "sidebar.nav.groundwater")).toBe("Aguas subterráneas");
    expect(portalText("fr", "dashboard.module.map.title")).toBe("Carte géospatiale 2D / 3D");
    expect(portalText("pt", "settings.languageLabel")).toBe("Idioma da interface");
    expect(portalText("en", "settings.languageLabel")).toBe("Interface language");
    expect(portalText("fr", "sidebar.settings")).toBe("Paramètres");
  });

  it("normalizes regional locales and uses English for missing portal catalogs", () => {
    expect(resolvedPortalLocale("pt-MZ")).toBe("pt");
    expect(resolvedPortalLocale("es-MX")).toBe("es");
    expect(resolvedPortalLocale("de")).toBe("en");
    expect(resolvedPortalLocale("ar")).toBe("en");
    expect(portalText("de", "dashboard.openModule")).toBe("Open module");
  });
});

describe("GeoMoz portal live language switch", () => {
  let listeners: Set<() => void>;
  let currentLanguage: string;
  beforeEach(() => {
    listeners = new Set();
    currentLanguage = "pt";
    window.GeoMozPreferences = {
      getLanguage: () => currentLanguage,
      setLanguage: (language: string) => {
        currentLanguage = language;
        for (const cb of listeners) cb();
        return true;
      },
      getReducedMotion: () => false,
      setReducedMotion: () => {},
      subscribe: (callback: () => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };
  });
  afterEach(() => {
    cleanup();
    delete window.GeoMozPreferences;
  });
  it("rerenders immediately without navigating or reloading", () => {
    const { result } = renderHook(() => usePortalTranslation());
    expect(result.current.t("sidebar.settings")).toBe("Definições");
    act(() => result.current.setLanguage("en"));
    expect(result.current.t("sidebar.settings")).toBe("Settings");
    act(() => result.current.setLanguage("fr"));
    expect(result.current.t("sidebar.settings")).toBe("Paramètres");
    expect(listeners.size).toBeGreaterThan(0);
  });
});

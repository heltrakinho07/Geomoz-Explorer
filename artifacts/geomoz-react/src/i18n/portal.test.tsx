// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import { PORTAL_CATALOGS, GEOLIBRE_LANGUAGE_OPTIONS, PORTAL_TRANSLATED_LANGUAGES, portalText, resolvedPortalLocale } from "./portal";
import { usePortalTranslation } from "./usePortalTranslation";
import { hazardsText, HAZARDS_MESSAGES } from "./hazards";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("localizes dashboard project metadata, report metrics, basemap choices, billing and storage", () => {
    expect(portalText("en", "dashboard.aoiLabel")).toBe("Study area:");
    expect(portalText("es", "dashboard.calculateIndices")).toBe("Calcular índices");
    expect(portalText("fr", "dashboard.category.water")).toBe("Ressources en eau et aquifères");
    expect(portalText("en", "dashboard.mean")).toBe("Mean");
    expect(portalText("en", "dashboard.tag.ai")).toBe("Intelligent agent");
    expect(portalText("en", "settings.basemapHybrid")).toContain("satellite and roads");
    expect(portalText("fr", "settings.storageSummary")).toBe("Résumé du stockage Firestore");
    expect(portalText("es", "settings.plansAndPayments")).toBe("Ver planes y pagos");
    expect(portalText("en", "settings.renewalHint")).not.toContain("PayZeno");
  });

  it("translates GEE account, NDVI test controls and asynchronous feedback", () => {
    expect(portalText("en", "settings.gee.personalAccess")).toBe("Personal Google Earth Engine access");
    expect(portalText("en", "settings.gee.connectGoogle")).toBe("Connect with Google account");
    expect(portalText("es", "settings.gee.ndviDescription")).toContain("mayo");
    expect(portalText("fr", "settings.gee.projectId")).toContain("projet Google Cloud");
    expect(portalText("de", "settings.feedback.preferencesSaved")).toBe("Preferences saved.");
    expect(portalText("en", "settings.account.authenticated")).toBe("Authenticated session");
  });

  it("preserves all 21 GeoLibre locales without misrepresenting the selected one", () => {
    const languages = GEOLIBRE_LANGUAGE_OPTIONS.map(option => option.code);
    expect(languages.length).toBe(21);
    expect(new Set(languages).size).toBe(21);
    for(const locale of PORTAL_TRANSLATED_LANGUAGES){
      expect(languages).toContain(locale);
      expect(resolvedPortalLocale(locale)).toBe(locale);
    }
    for(const locale of languages.filter(code => !PORTAL_TRANSLATED_LANGUAGES.some(translated => translated === code))){
      expect(resolvedPortalLocale(locale)).toBe("en");
    }
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

describe("GeoMoz geohazards scientific module localization", () => {
  it("provides complete PT EN ES FR translations and a safe fallback", () => {
    expect(Object.keys(HAZARDS_MESSAGES).length).toBeGreaterThan(190);
    for (const [key, labels] of Object.entries(HAZARDS_MESSAGES)) {
      expect(labels).toHaveLength(4);
      for (const label of labels) {
        expect(label.trim(), key).not.toBe("");
      }
    }
    expect(hazardsText("en", "tool.flood")).toBe("Floods");
    expect(hazardsText("es", "soil.layer.susm")).toContain("Zona radicular");
    expect(hazardsText("fr", "result.exportPdf")).toBe("Exporter un rapport PDF");
    expect(hazardsText("de", "gee.required")).toBe("Google Earth Engine required");
  });

  it("resolves every used key and preserves the six GEE algorithms and numeric controls", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/Geoperigos.tsx"), "utf8");
    const keys = [...page.matchAll(/\bh\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(130);
    for (const key of keys) {
      expect(Object.prototype.hasOwnProperty.call(HAZARDS_MESSAGES, key), key).toBe(true);
    }
    for (const path of ["/geomoz-api/gee/flood", "/geomoz-api/gee/erosion", "/geomoz-api/gee/wildfire", "/geomoz-api/gee/drought", "/geomoz-api/gee/burned-area", "/geomoz-api/gee/soil-moisture"]) {
      expect(page).toContain(path);
    }
    expect(page).toContain("layer: soilLayer");
    expect(page).toContain("onClick={runFlood}");
    expect(page).toContain('h("result.exportPdf")');
  });

  it("changes localized scientific controls reactively without reloading", () => {
    let currentLanguage = "pt";
    const subscribers = new Set<() => void>();
    window.GeoMozPreferences = {
      getLanguage: () => currentLanguage,
      setLanguage: (value: string) => {
        currentLanguage = value;
        subscribers.forEach(callback => callback());
        return true;
      },
      getReducedMotion: () => false,
      setReducedMotion: () => {},
      subscribe: (callback: () => void) => {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    };
    const { result } = renderHook(() => usePortalTranslation());
    expect(hazardsText(result.current.translatedLocale, "tool.drought")).toBe("Seca");
    act(() => result.current.setLanguage("en"));
    expect(hazardsText(result.current.translatedLocale, "tool.drought")).toBe("Drought");
    act(() => result.current.setLanguage("fr"));
    expect(hazardsText(result.current.translatedLocale, "tool.drought")).toBe("Sécheresse");
    act(() => result.current.setLanguage("de"));
    expect(hazardsText(result.current.translatedLocale, "tool.drought")).toBe("Drought");
    cleanup();
    delete window.GeoMozPreferences;
  });
});


describe("GeoMoz Settings language coverage and consistency", () => {
  it("localizes the complete settings navigation chrome in each reviewed language", () => {
    const keys = [
      "settings.chrome.back", "settings.chrome.accountPreferences",
      "settings.chrome.sectionNav", "settings.chrome.cloudProcessing",
      "settings.section.geeSubtitle", "settings.section.profileSubtitle",
      "settings.section.preferencesSubtitle", "settings.section.storageSubtitle",
      "settings.section.billingSubtitle", "settings.section.documentationSubtitle",
      "settings.documentation.title", "settings.documentation.description",
      "settings.documentation.open", "settings.languagePartialTitle",
      "settings.languagePartialDescription", "settings.languageReviewedDescription",
    ] as const;
    for (const key of keys) {
      for (const language of PORTAL_TRANSLATED_LANGUAGES) {
        expect(portalText(language, key), language + ": " + key).toBeTruthy();
      }
    }
    expect(portalText("en", "settings.chrome.accountPreferences")).toBe("GeoMoz account preferences");
    expect(portalText("es", "settings.chrome.back")).toBe("Volver a la plataforma");
    expect(portalText("fr", "settings.section.preferencesSubtitle")).toBe("Langue, cartes et affichage");
    expect(portalText("it", "settings.chrome.accountPreferences")).toBe("GeoMoz account preferences");
    expect(portalText("it", "settings.languagePartialDescription")).toContain("{name}");
  });

  it("does not mix fixed Portuguese strings into English/Italian settings and advertises GIS-only fallback", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/SettingsDialog.tsx"), "utf8");
    for (const key of [
      "settings.chrome.accountPreferences", "settings.chrome.sectionNav", "settings.chrome.back",
      "settings.section.preferencesSubtitle", "settings.documentation.title",
      "settings.documentation.description", "settings.chrome.cloudProcessing",
      "settings.languagePartialTitle", "settings.languagePartialDescription",
    ]) {
      expect(source).toContain(`t("${key}")`);
    }
    expect(source).toContain('data-testid="geomoz-language-fallback"');
    expect(source).toContain('data-testid="geomoz-language-reviewed-info"');
    expect(source).not.toContain("Preferências da conta GeoMoz");
    expect(source).not.toContain('aria-label="Secções de definições"');
    expect(source).not.toContain('subtitle: "Idioma, mapas e visualização"');
  });
});

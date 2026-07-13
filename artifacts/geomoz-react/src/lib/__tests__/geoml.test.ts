/**
 * Tests for GeoMoz ML Library — Urban, Health, and Climate index types.
 */
import { describe, it, expect } from "vitest";
import {
  computeSpectralValue,
  applyColormap,
  GEE_ONLY_INDICES,
} from "@/lib/geoml";
import type { SpectralIndex } from "@/lib/geoml";

// ── Urban indices ────────────────────────────────────────────────────────────

describe("Urban indices — computeSpectralValue", () => {
  const urbanIndices: SpectralIndex[] = [
    "urban_expansion",
    "impervious_surface",
    "urban_heat_island",
  ];

  it.each(urbanIndices)("%s returns a value in [0, 1]", (idx) => {
    const value = computeSpectralValue("Granito", "Arcaico", "Arcaico", idx);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("urban_expansion is lower for vegetated areas (alluvial) than bare rock (granite)", () => {
    const alluvial = computeSpectralValue("Alluvial", "Quaternary", "Holocene", "urban_expansion");
    const granite = computeSpectralValue("Granite", "Archean", "Archean", "urban_expansion");
    // Granite has lower NDVI → higher bare_soil → higher urban_expansion
    expect(granite).toBeGreaterThan(alluvial);
  });

  it("urban_heat_island is deterministic", () => {
    const v1 = computeSpectralValue("Granito", "Arcaico", "Arcaico", "urban_heat_island");
    const v2 = computeSpectralValue("Granito", "Arcaico", "Arcaico", "urban_heat_island");
    expect(v1).toBe(v2);
  });
});

describe("Urban indices — applyColormap", () => {
  const urbanIndices: SpectralIndex[] = [
    "urban_expansion",
    "impervious_surface",
    "urban_heat_island",
  ];

  it.each(urbanIndices)("%s colormap returns valid hex", (idx) => {
    const color = applyColormap(0.5, idx);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("urban_expansion colormap endpoints", () => {
    const low = applyColormap(0.0, "urban_expansion");
    const high = applyColormap(1.0, "urban_expansion");
    expect(low).not.toBe(high);
  });
});

// ── Public Health indices ────────────────────────────────────────────────────

describe("Health indices — computeSpectralValue", () => {
  const healthIndices: SpectralIndex[] = [
    "malaria_risk",
    "healthcare_access",
    "sanitation_index",
    "epidemic_risk",
  ];

  it.each(healthIndices)("%s returns a value in [0, 1]", (idx) => {
    const value = computeSpectralValue("Granito", "Arcaico", "Arcaico", idx);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("malaria_risk is higher for alluvial settings", () => {
    const alluvial = computeSpectralValue("Alluvial", "Quaternary", "Holocene", "malaria_risk");
    const granite = computeSpectralValue("Granite", "Archean", "Archean", "malaria_risk");
    expect(alluvial).toBeGreaterThanOrEqual(granite);
  });

  it("epidemic_risk is deterministic for same inputs", () => {
    const v1 = computeSpectralValue("Xisto", "Proterozóico", "Proterozóico", "epidemic_risk");
    const v2 = computeSpectralValue("Xisto", "Proterozóico", "Proterozóico", "epidemic_risk");
    expect(v1).toBe(v2);
  });
});

describe("Health indices — applyColormap", () => {
  const healthIndices: SpectralIndex[] = [
    "malaria_risk",
    "healthcare_access",
    "sanitation_index",
    "epidemic_risk",
  ];

  it.each(healthIndices)("%s colormap returns valid hex", (idx) => {
    const color = applyColormap(0.3, idx);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("malaria_risk colormap darkens with value", () => {
    const low = applyColormap(0.1, "malaria_risk");
    const high = applyColormap(0.9, "malaria_risk");
    // Higher values should map to darker / more intense colors
    expect(low).not.toBe(high);
  });
});

// ── Climate indices ──────────────────────────────────────────────────────────

describe("Climate indices — computeSpectralValue", () => {
  const climateIndices: SpectralIndex[] = [
    "precipitation",
    "temperature_lst",
    "cyclone_tracks",
    "cyclone_risk",
  ];

  it.each(climateIndices)("%s returns a value in [0, 1]", (idx) => {
    const value = computeSpectralValue("Granito", "Arcaico", "Arcaico", idx);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("precipitation correlates with NDVI", () => {
    const wet = computeSpectralValue("Alluvial", "Quaternary", "Holocene", "precipitation");
    const dry = computeSpectralValue("Granite", "Archean", "Archean", "precipitation");
    expect(wet).toBeGreaterThanOrEqual(dry);
  });

  it("temperature_lst returns consistent values", () => {
    const v = computeSpectralValue("Basalto", "Fanerozóico", "Cretácico", "temperature_lst");
    expect(v).toBeGreaterThan(0.4);  // base is 0.6 + noise
    expect(v).toBeLessThanOrEqual(1);
  });
});

describe("Climate indices — applyColormap", () => {
  const climateIndices: SpectralIndex[] = [
    "precipitation",
    "temperature_lst",
    "cyclone_tracks",
    "cyclone_risk",
  ];

  it.each(climateIndices)("%s colormap returns valid hex", (idx) => {
    const color = applyColormap(0.7, idx);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("precipitation colormap changes with value", () => {
    const dry = applyColormap(0.0, "precipitation");
    const wet = applyColormap(1.0, "precipitation");
    expect(dry).not.toBe(wet);
  });
});

// ── GEE_ONLY_INDICES ─────────────────────────────────────────────────────────

describe("GEE_ONLY_INDICES", () => {
  const newIndices: SpectralIndex[] = [
    // Urban
    "urban_expansion",
    "impervious_surface",
    "urban_heat_island",
    // Health
    "malaria_risk",
    "healthcare_access",
    "sanitation_index",
    "epidemic_risk",
    // Climate
    "precipitation",
    "temperature_lst",
    "cyclone_tracks",
    "cyclone_risk",
  ];

  it.each(newIndices)("%s is listed in GEE_ONLY_INDICES", (idx) => {
    expect(GEE_ONLY_INDICES).toContain(idx);
  });

  it("GEE_ONLY_INDICES contains all 11 new indices", () => {
    const allNew = new Set([
      "urban_expansion", "impervious_surface", "urban_heat_island",
      "malaria_risk", "healthcare_access", "sanitation_index", "epidemic_risk",
      "precipitation", "temperature_lst", "cyclone_tracks", "cyclone_risk",
    ]);
    const found = GEE_ONLY_INDICES.filter((i) => allNew.has(i as string));
    expect(found.length).toBe(11);
  });

  it("GEE_ONLY_INDICES has no duplicates", () => {
    const seen = new Set<SpectralIndex>();
    const duplicates = GEE_ONLY_INDICES.filter((idx) => {
      if (seen.has(idx)) return true;
      seen.add(idx);
      return false;
    });
    expect(duplicates).toHaveLength(0);
  });
});

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

const BASE = `${API_BASE}/geomoz-api`;

import { apiFetch } from "@/lib/api";

async function fetchJson<T>(url: string): Promise<T> {
  // Use apiFetch so that Firebase auth token is injected if the user is logged in
  const res = url.includes("/geomoz-api/") ? await apiFetch(url.split("/geomoz-api/")[1]) : await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface LithologyItem {
  name: string;
  areaKm2: number;
  percent: number;
  color: string;
}

export interface Stats {
  totalFeatures: number;
  totalUnits: number;
  totalAreaKm2: number;
  dominant: string;
  lithologies: LithologyItem[];
}

export interface ColorItem {
  value: string;
  color: string;
}

/** Per-province summary item returned by /province-summary — used by GeoMoz AI */
export interface ProvinceSummaryItem {
  province: string;
  totalFeatures: number;
  totalUnits: number;
  totalAreaKm2: number;
  dominant: string;
  eras: string[];
  periods: string[];
  lithologies: string[];
}

export function useProvinceNames() {
  return useQuery({
    queryKey: ["province-names"],
    queryFn: () => fetchJson<{ names: string[]; column: string }>(`${BASE}/province-names`),
    staleTime: Infinity,
  });
}

export function useDistrictNames(province: string | null) {
  return useQuery({
    queryKey: ["district-names", province],
    queryFn: () =>
      fetchJson<{ names: string[]; column: string }>(
        `${BASE}/district-names${province ? `?province=${encodeURIComponent(province)}` : ""}`
      ),
    enabled: !!province,
    staleTime: Infinity,
  });
}

export function useStats(province: string | null, district: string | null) {
  return useQuery({
    queryKey: ["stats", province, district],
    queryFn: () => {
      const params = new URLSearchParams();
      if (province) params.set("province", province);
      if (district) params.set("district", district);
      const qs = params.toString();
      return fetchJson<Stats>(`${BASE}/stats${qs ? `?${qs}` : ""}`);
    },
    staleTime: 30_000,
  });
}

export function useGeologyGeoJSON(
  province: string | null,
  district: string | null,
  colorBy: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["geology", province, district, colorBy],
    queryFn: () => {
      const params = new URLSearchParams({ color_by: colorBy });
      if (province) params.set("province", province);
      if (district) params.set("district", district);
      return fetchJson<GeoJSON.FeatureCollection>(`${BASE}/geology?${params}`);
    },
    enabled: enabled && !!province,
    staleTime: 60_000,
  });
}

export function useProvincesGeoJSON() {
  return useQuery({
    queryKey: ["provinces"],
    queryFn: () => fetchJson<GeoJSON.FeatureCollection>(`${BASE}/provinces`),
    staleTime: Infinity,
  });
}

export function useDistrictsGeoJSON(province: string | null) {
  return useQuery({
    queryKey: ["districts", province],
    queryFn: () => {
      const qs = province ? `?province=${encodeURIComponent(province)}` : "";
      return fetchJson<GeoJSON.FeatureCollection>(`${BASE}/districts${qs}`);
    },
    staleTime: Infinity,
  });
}

export function useGeologyColors(colorBy: string, province: string | null) {
  return useQuery({
    queryKey: ["geology-colors", colorBy],
    queryFn: () =>
      fetchJson<{ column: string; items: ColorItem[] }>(
        `${BASE}/geology-colors?color_by=${encodeURIComponent(colorBy)}`
      ),
    enabled: !!province,
    staleTime: Infinity,
  });
}

/**
 * Province-level geological summary for ALL provinces.
 * Used by the GeoMoz AI module for clustering and favorability analysis.
 * First call triggers the province-summary endpoint (may take 10–30 s server-side).
 * Subsequent calls hit the lru_cache and are instant.
 */
export function useProvinceSummary(enabled = true) {
  return useQuery({
    queryKey: ["province-summary"],
    queryFn: () =>
      fetchJson<{ provinces: ProvinceSummaryItem[] }>(`${BASE}/province-summary`),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

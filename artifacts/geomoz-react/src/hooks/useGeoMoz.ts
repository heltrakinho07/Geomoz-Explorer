import { useQuery } from "@tanstack/react-query";

const BASE = "/geomoz-api";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
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

export function useProvinceNames() {
  return useQuery({
    queryKey: ["province-names"],
    queryFn: () =>
      fetchJson<{ names: string[]; column: string }>(`${BASE}/province-names`),
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
  colorBy: string
) {
  return useQuery({
    queryKey: ["geology", province, district, colorBy],
    queryFn: () => {
      const params = new URLSearchParams({ color_by: colorBy });
      if (province) params.set("province", province);
      if (district) params.set("district", district);
      return fetchJson<GeoJSON.FeatureCollection>(`${BASE}/geology?${params}`);
    },
    staleTime: 30_000,
  });
}

export function useProvincesGeoJSON() {
  return useQuery({
    queryKey: ["provinces"],
    queryFn: () =>
      fetchJson<GeoJSON.FeatureCollection>(`${BASE}/provinces`),
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

export function useGeologyColors(colorBy: string) {
  return useQuery({
    queryKey: ["geology-colors", colorBy],
    queryFn: () =>
      fetchJson<{ column: string; items: ColorItem[] }>(
        `${BASE}/geology-colors?color_by=${encodeURIComponent(colorBy)}`
      ),
    staleTime: Infinity,
  });
}

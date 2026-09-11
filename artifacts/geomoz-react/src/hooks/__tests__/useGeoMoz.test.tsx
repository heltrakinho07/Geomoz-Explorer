import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";

import {
  useProvinceNames,
  useDistrictNames,
  useStats,
  useGeologyGeoJSON,
  useProvincesGeoJSON,
  useDistrictsGeoJSON,
  useGeologyColors,
} from "@/hooks/useGeoMoz";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("useProvinceNames", () => {
  it("fetches province names successfully", async () => {
    const mockData = { names: ["Maputo", "Gaza", "Inhambane"], column: "Provincia" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useProvinceNames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/province-names"),
      expect.anything()
    );
  });

  it("handles fetch error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const { result } = renderHook(() => useProvinceNames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDistrictNames", () => {
  it("fetches district names for a province", async () => {
    const mockData = { names: ["Manhiça", "Marracuene"], column: "Distrito" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useDistrictNames("Maputo"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("province=Maputo"),
      expect.anything()
    );
  });

  it("is disabled when province is null", () => {
    const { result } = renderHook(() => useDistrictNames(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useStats", () => {
  it("fetches stats with province and district params", async () => {
    const mockStats = {
      totalFeatures: 42,
      totalUnits: 10,
      totalAreaKm2: 5000,
      dominant: "Granito",
      lithologies: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockStats),
    });

    const { result } = renderHook(
      () => useStats("Maputo", "Manhiça"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockStats);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("province=Maputo"),
      expect.anything()
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("district=Manhi%C3%A7a"),
      expect.anything()
    );
  });

  it("handles empty params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ totalFeatures: 0, totalUnits: 0, totalAreaKm2: 0, dominant: "N/A", lithologies: [] }),
    });

    const { result } = renderHook(() => useStats(null, null), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Should not include empty params in URL
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("province=");
    expect(url).not.toContain("district=");
  });
});

describe("useGeologyGeoJSON", () => {
  it("fetches geology data", async () => {
    const mockGeoJSON: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockGeoJSON),
    });

    const { result } = renderHook(
      () => useGeologyGeoJSON("Maputo", null, "code2006", true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("color_by=code2006"),
      expect.anything()
    );
  });

  it("is disabled when no province is selected", () => {
    const { result } = renderHook(
      () => useGeologyGeoJSON(null, null, "code2006", true),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useProvincesGeoJSON", () => {
  it("fetches provinces geojson", async () => {
    const mockGeoJSON: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockGeoJSON),
    });

    const { result } = renderHook(() => useProvincesGeoJSON(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/provinces"),
      expect.anything()
    );
  });
});

describe("useDistrictsGeoJSON", () => {
  it("fetches districts for a province", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ type: "FeatureCollection", features: [] }),
    });

    const { result } = renderHook(() => useDistrictsGeoJSON("Maputo"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("province=Maputo"),
      expect.anything()
    );
  });
});

describe("useGeologyColors", () => {
  it("fetches geology colors", async () => {
    const mockColors = {
      column: "code2006",
      items: [{ value: "Granito", color: "#ff0000" }],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockColors),
    });

    const { result } = renderHook(
      () => useGeologyColors("code2006", "Maputo"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockColors);
  });
});

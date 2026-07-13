import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import App from "@/App";

// Mock fetch globally — Explorer makes multiple API calls on mount
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  // Provide a catch-all default response for any API call during render
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("geology") || url.includes("provinces") || url.includes("districts")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ type: "FeatureCollection", features: [] }),
      });
    }
    if (url.includes("stats")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ totalFeatures: 0, totalUnits: 0, totalAreaKm2: 0, dominant: "N/A", lithologies: [] }),
      });
    }
    if (url.includes("gee/status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ connected: false, indices: [], config: {} }),
      });
    }
    if (url.includes("gee/config")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: { connected: false },
          }),
      });
    }
    if (url.includes("province-summary")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ provinces: [] }),
      });
    }
    // Province/district names
    if (url.includes("names")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ names: [], column: "name" }),
      });
    }
    // Default fallback
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
});

describe("App", () => {
  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});

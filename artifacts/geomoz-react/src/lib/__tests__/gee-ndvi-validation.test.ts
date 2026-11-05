import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { MAPUTO_GEE_TEST_AOI, validateRealSentinel2Ndvi } from "@/lib/gee-ndvi-validation";

const mockedFetch = vi.mocked(apiFetch);
const reply = (status: number, data: Record<string, unknown>, contentType = "application/json"): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    json: async () => data,
  }) as unknown as Response;

afterEach(() => {
  vi.clearAllMocks();
});

describe("real Sentinel-2 GEE NDVI validation", () => {
  it("requires a production NDVI tile and a non-zero real Sentinel scene count", async () => {
    mockedFetch.mockResolvedValueOnce(reply(200, {
      tileUrl: "https://earthengine.googleapis.com/map/tiles/{z}/{x}/{y}",
      sceneCount: 12,
      stats: { mean: 0.4321 },
      dateRange: "2025-05-01 → 2025-09-01",
    }));
    const result = await validateRealSentinel2Ndvi();
    expect(result.sceneCount).toBe(12);
    expect(result.meanNdvi).toBe(0.4321);
    expect(result.message).toContain("Processamento real concluído");
    const [url, options] = mockedFetch.mock.calls[0];
    expect(url).toBe("/geomoz-api/gee/index");
    const input = JSON.parse(String(options?.body));
    expect(input.index).toBe("ndvi");
    expect(input.geometry).toEqual(MAPUTO_GEE_TEST_AOI);
    expect(input.cloud_pct).toBe(65);
    expect(options?.method).toBe("POST");
  });

  it("refuses to call an empty Sentinel-2 collection a successful test", async () => {
    mockedFetch.mockResolvedValueOnce(reply(200, {
      tileUrl: "https://earthengine.googleapis.com/tile/{z}/{x}/{y}",
      sceneCount: 0,
    }));
    await expect(validateRealSentinel2Ndvi()).rejects.toThrow("resposta incompleta");
  });

  it("reports an account-specific GEE 403 without claiming processing succeeded", async () => {
    mockedFetch.mockResolvedValueOnce(reply(403, {
      detail: "Ligue a sua conta Earth Engine.",
    }));
    await expect(validateRealSentinel2Ndvi()).rejects.toThrow("conta Earth Engine autorizada");
  });

  it("shows backend quota/service errors instead of hiding them", async () => {
    mockedFetch.mockResolvedValueOnce(reply(503, {
      detail: "Quota do projecto excedida.",
    }));
    await expect(validateRealSentinel2Ndvi()).rejects.toThrow("Quota do projecto excedida");
  });

  it("does not confuse Firebase Hosting HTML with a GEE processing response", async () => {
    mockedFetch.mockResolvedValueOnce(reply(200, {}, "text/html"));
    await expect(validateRealSentinel2Ndvi()).rejects.toThrow("HTML");
  });

  it("reports image generation without stats without inventing a NDVI mean", async () => {
    mockedFetch.mockResolvedValueOnce(reply(200, {
      tileUrl: "https://earthengine.googleapis.com/map/{z}/{x}/{y}",
      sceneCount: 8,
      stats: {},
    }));
    const result = await validateRealSentinel2Ndvi();
    expect(result.meanNdvi).toBeNull();
    expect(result.message).toContain("estatísticas não ficaram disponíveis");
  });
});

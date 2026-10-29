import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getQmsTileSource, parseQmsSearchResponse, parseQmsTileSource, searchQmsBasemaps,
} from "../qms-catalog";

const valid = {
  id: 448,
  name: "Mapa público",
  desc: "Cartografia de base",
  type: "tms",
  epsg: 3857,
  cumulative_status: "works",
  url: "https://tiles.example.org/{z}/{x}/{y}.png",
  y_origin_top: true,
  copyright_text: 'Fornecedor <script>alert("x")</script>',
  terms_of_use_url: "https://example.org/terms",
  z_max: 17,
};

describe("NextGIS QMS basemap catalogue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only lists functioning Web Mercator TMS sources", () => {
    const response = { results: [
      valid, { ...valid, id: 2, type: "wms" },
      { ...valid, id: 3, cumulative_status: "failed" },
      { ...valid, id: 4, epsg: 4326 },
    ] };
    expect(parseQmsSearchResponse(response)).toEqual([{
      id: 448, name: "Mapa público", description: "Cartografia de base",
    }]);
    expect(() => parseQmsSearchResponse({ unexpected: true })).toThrow(/inválida/);
  });

  it("normalizes supported XYZ tiles with safe attribution and original terms", () => {
    const result = parseQmsTileSource(valid);
    expect(result.url).toBe(valid.url);
    expect(result.tms).toBe(false);
    expect(result.maxZoom).toBe(17);
    expect(result.attribution).toContain("&lt;script&gt;");
    expect(result.attribution).not.toContain("<script>");
    expect(result.termsUrl).toBe("https://example.org/terms");
  });

  it("supports bottom-origin TMS and rejects incompatible or unsafe tiles", () => {
    expect(parseQmsTileSource({ ...valid, y_origin_top: false }).tms).toBe(true);
    expect(() => parseQmsTileSource({ ...valid, url: "http://tiles.example.org/{z}/{x}/{y}.png" }))
      .toThrow(/HTTPS/);
    expect(() => parseQmsTileSource({ ...valid, url: "https://localhost/{z}/{x}/{y}.png" }))
      .toThrow(/HTTPS/);
    expect(() => parseQmsTileSource({ ...valid, url: "https://tiles.example.org/{q}.png" }))
      .toThrow(/formato/);
    expect(() => parseQmsTileSource({ ...valid, url: "https://tiles.example.org/{z}/{x}/{y}.png?token=secret" }))
      .toThrow(/credenciais/);
    expect(() => parseQmsTileSource({ ...valid, epsg: 4326 })).toThrow(/Web Mercator/);
  });

  it("builds restricted catalogue requests and validates selected IDs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [valid] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const list = await searchQmsBasemaps(" OSM ");
    expect(list).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("search")).toBe("OSM");
    expect(url.searchParams.get("epsg")).toBe("3857");
    expect(url.searchParams.get("type")).toBe("tms");
    expect(url.searchParams.get("cumulative_status")).toBe("works");
    expect(await searchQmsBasemaps(" ")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(getQmsTileSource(-1)).rejects.toThrow(/inválido/);
  });

  it("checks the detail ID before using third-party tile URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => valid,
    }));
    await expect(getQmsTileSource(448)).resolves.toMatchObject({ id: 448 });
    await expect(getQmsTileSource(449)).rejects.toThrow(/outro serviço/);
  });
});

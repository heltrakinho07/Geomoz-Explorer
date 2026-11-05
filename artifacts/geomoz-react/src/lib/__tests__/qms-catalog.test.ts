import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundsToQmsWkt, createQmsPreviewTile, getQmsTileSource, parseQmsExtent, parseQmsSearchResponse, parseQmsTileSource, searchQmsBasemaps,
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

  it("uses documented geographic extent filter only when a bbox is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ results: [valid] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await searchQmsBasemaps("satélite", undefined, [30, -27, 42, -10]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("intersects_extent"))
      .toBe("POLYGON((30 -27,42 -27,42 -10,30 -10,30 -27))");
    expect(boundsToQmsWkt([30, -27, 42, -10])).toContain("POLYGON");
    expect(() => boundsToQmsWkt([42, -27, 30, -10])).toThrow(/inválida/);
    expect(() => boundsToQmsWkt([30, -95, 42, -10])).toThrow(/inválida/);
  });

  it("extracts provider bounds and respects sample zoom limits", () => {
    const extent = "SRID=4326;POLYGON ((30 -27,42 -27,42 -10,30 -10,30 -27))";
    expect(parseQmsExtent(extent)).toEqual([30, -27, 42, -10]);
    expect(parseQmsExtent("MULTIPOLYGON ((x))")).toBeUndefined();
    expect(parseQmsExtent("POLYGON ((30 -95,42 -27,42 -10,30 -95))")).toBeUndefined();
    const source = parseQmsTileSource({ ...valid, z_min: 14, z_max: 16, extent });
    expect(source.minZoom).toBe(14);
    expect(source.extent).toEqual([30, -27, 42, -10]);
    const preview = createQmsPreviewTile(source, [30, -27, 42, -10]);
    expect(preview?.zoom).toBe(14);
    expect(preview?.url).toMatch(/\/14\/\d+\/\d+\.png$/);
    expect(createQmsPreviewTile(source, [120, -40, 150, -15])).toBeNull();
  });

  it("inverts the Y mosaic index for TMS without altering XYZ X/Z", () => {
    const xyz = parseQmsTileSource({ ...valid, z_max: 12, y_origin_top: true });
    const tms = parseQmsTileSource({ ...valid, z_max: 12, y_origin_top: false });
    const a = createQmsPreviewTile(xyz);
    const b = createQmsPreviewTile(tms);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a?.x).toBe(b?.x);
    expect(a?.zoom).toBe(b?.zoom);
    expect((a?.y ?? 0) + (b?.y ?? 0)).toBe(2 ** 12 - 1);
    expect(a?.url).not.toBe(b?.url);
  });

});

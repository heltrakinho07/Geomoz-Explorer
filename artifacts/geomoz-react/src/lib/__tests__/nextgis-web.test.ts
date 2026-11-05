import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeNgwOrigin, parseNgwResources, buildNgwTileDefinition, listNgwResources,
  importNgwVector, parseNgwVectorGeoJson, MAX_NGW_VECTOR_BYTES, MAX_NGW_VECTOR_FEATURES,
  type NgwResource,
} from "../nextgis-web";

const wrap = (id: number, cls: string, name: string, parent = 0, children = false) => ({
  resource: { id, cls, display_name: name, parent: { id: parent }, children },
});
const style: NgwResource = {
  id: 47, parentId: 0, name: "Mapa topográfico <privado>",
  className: "mapserver_style", kind: "tile", hasChildren: false,
};

describe("NextGIS Web public catalogue adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes only public HTTPS server origins", () => {
    expect(normalizeNgwOrigin(" https://maps.example.org/ ")).toBe("https://maps.example.org");
    expect(() => normalizeNgwOrigin("http://maps.example.org")).toThrow(/HTTPS/);
    expect(() => normalizeNgwOrigin("https://user:pass@maps.example.org")).toThrow(/HTTPS/);
    expect(() => normalizeNgwOrigin("https://maps.example.org/?token=abc")).toThrow(/HTTPS/);
    expect(() => normalizeNgwOrigin("https://maps.example.org/api/")).toThrow(/HTTPS/);
    expect(() => normalizeNgwOrigin("https://localhost")).toThrow(/pública/);
    expect(() => normalizeNgwOrigin("https://127.0.0.1")).toThrow(/pública/);
    expect(() => normalizeNgwOrigin("https://192.168.1.10")).toThrow(/pública/);
  });

  it("filters unsupported and mismatched resources and deduplicates IDs", () => {
    const found = parseNgwResources([
      wrap(10, "resource_group", "Cartografia", 0, true),
      wrap(47, "mapserver_style", style.name),
      wrap(47, "mapserver_style", "Duplicado"),
      wrap(51, "qgis_vector_style", "Geologia"),
      wrap(59, "raster_style", "DEM"),
      wrap(62, "wmsclient_layer", "OGC"),
      wrap(63, "webmap", "Atlas"),
      wrap(64, "vector_layer", "Dados brutos"),
      wrap(65, "resource_group", "Outro nível", 22, true),
      wrap(-1, "webmap", "Inválido"),
      wrap(66, "unknown", "Desconhecido"),
    ], 0);
    expect(found).toHaveLength(7);
    expect(found.filter(f => f.kind === "vector")).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 10, kind: "group", hasChildren: true });
    expect(found.filter(f => f.kind === "tile")).toHaveLength(5);
    expect(() => parseNgwResources({ resources: [] }, 0)).toThrow(/inválido/);
  });

  it("builds an original NextGIS Web tile resource request safely", () => {
    const layer = buildNgwTileDefinition("https://maps.example.org/", style);
    expect(layer.tiles).toEqual([
      "https://maps.example.org/api/component/render/tile?z={z}&x={x}&y={y}&resource=47",
    ]);
    expect(layer.sourceUrl).toBe("https://maps.example.org/resource/47");
    expect(layer.attribution).toContain("&lt;privado&gt;");
    expect(layer.attribution).not.toContain("<privado>");
    expect(() => buildNgwTileDefinition("https://maps.example.org", { ...style, kind: "group" }))
      .toThrow(/estilo/);
  });

  it("fetches public resource groups with omitted credentials and explicit CORS", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true, json: async () => [wrap(47, "mapserver_style", "Carta")],
    });
    vi.stubGlobal("fetch", spy);
    const result = await listNgwResources("https://maps.example.org", 0);
    expect(result).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(
      "https://maps.example.org/api/resource/?parent=0",
      expect.objectContaining({
        credentials: "omit", mode: "cors", redirect: "error", method: "GET",
      }),
    );
    await expect(listNgwResources("https://maps.example.org", -2)).rejects.toThrow(/inválido/);
  });

  it("reports access denial without exposing private API resources", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(listNgwResources("https://maps.example.org", 0))
      .rejects.toThrow(/Sem permissão/);
  });
});


describe("NextGIS Web vector import for local GeoMoz editing", () => {
  afterEach(() => vi.unstubAllGlobals());

  const vector: NgwResource = {
    id: 74, parentId: 0, name: "Geologia de Manica",
    kind: "vector", className: "vector_layer", hasChildren: false,
  };
  const valid = { type: "FeatureCollection", features: [
    { type: "Feature", id: 1, geometry: { type: "Point", coordinates: [32.58, -25.97] },
      properties: { litologia: "Granito" } },
  ] };

  it("accepts genuine WGS84 FeatureCollections and rejects projected or invalid coordinates", () => {
    expect(parseNgwVectorGeoJson(valid).features).toHaveLength(1);
    expect(() => parseNgwVectorGeoJson({
      ...valid, features: [{ ...valid.features[0],
        geometry: { type: "Point", coordinates: [580000, 7432000] } }],
    })).toThrow(/EPSG:4326/);
    expect(() => parseNgwVectorGeoJson({ type: "Feature", features: [] })).toThrow(/GeoJSON/);
    let nested: unknown = { type: "Point", coordinates: [32.58, -25.97] };
    for (let i = 0; i < 16; i++) nested = { type: "GeometryCollection", geometries: [nested] };
    expect(() => parseNgwVectorGeoJson({ type: "FeatureCollection", features: [
      { type: "Feature", geometry: nested, properties: {} },
    ] })).toThrow(/aninhada/);
    expect(() => parseNgwVectorGeoJson({ ...valid,
      features: Array(MAX_NGW_VECTOR_FEATURES + 1).fill(valid.features[0]),
    })).toThrow(/limite/);
  });

  it("imports vectors with output CRS forced to 4326 and without credentials", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, headers: new Headers(), body: null, text: async () => JSON.stringify(valid),
    });
    vi.stubGlobal("fetch", mock);
    const result = await importNgwVector("https://maps.example.org", vector);
    expect(result.features).toHaveLength(1);
    expect(mock).toHaveBeenCalledWith(
      "https://maps.example.org/api/resource/74/export?format=GeoJSON&srs=4326&zipped=False",
      expect.objectContaining({ credentials: "omit", redirect: "error", mode: "cors" }),
    );
  });

  it("rejects oversized responses before parsing and unsupported resources", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, headers: new Headers({ "content-length": String(MAX_NGW_VECTOR_BYTES + 1) }),
      body: null, text: async () => JSON.stringify(valid),
    });
    vi.stubGlobal("fetch", mock);
    await expect(importNgwVector("https://maps.example.org", vector)).rejects.toThrow(/8 MB/);
    await expect(importNgwVector("https://maps.example.org", {
      ...vector, kind: "tile",
    })).rejects.toThrow(/vectorial/);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("rejects denied vector access and limits the downloaded stream", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 403, headers: new Headers(),
    }));
    await expect(importNgwVector("https://maps.example.org", vector)).rejects.toThrow(/autorização/);
  });
});

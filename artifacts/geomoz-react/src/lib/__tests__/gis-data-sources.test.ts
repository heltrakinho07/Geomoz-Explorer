import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compatibleWmtsMatrixSets,
  createWmsTileUrl,
  createWmtsTileUrl,
  fetchWmsCapabilities,
  fetchWmtsCapabilities,
  validateXyzTemplate,
} from "../gis-data-sources";
import {
  PLANETARY_COMPUTER_STAC,
  connectStacApi,
  resolveStacAssetHref,
  searchStacItems,
  stacRasterAssets,
} from "../stac-client";
import {
  connectOgcApiFeatures,
  importOgcApiFeatures,
} from "../ogc-api-features";

describe("GIS remote data sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("discovers WMS layers and builds a MapLibre GetMap template", async () => {
    const xml = `<?xml version="1.0"?>
      <WMS_Capabilities version="1.3.0">
        <Service><Title>GeoMoz Demo WMS</Title></Service>
        <Capability>
          <Layer>
            <Layer>
              <Name>geology</Name>
              <Title>Geologia</Title>
              <Style><Name>default</Name><Title>Default</Title></Style>
            </Layer>
          </Layer>
        </Capability>
      </WMS_Capabilities>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(xml, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        })
      )
    );

    const capabilities = await fetchWmsCapabilities(
      "https://maps.example.test/wms?SERVICE=WMS&REQUEST=GetCapabilities"
    );

    expect(capabilities.title).toBe("GeoMoz Demo WMS");
    expect(capabilities.version).toBe("1.3.0");
    expect(capabilities.layers[0]).toMatchObject({
      name: "geology",
      title: "Geologia",
    });

    const tileUrl = createWmsTileUrl({
      endpoint: capabilities.endpoint,
      layer: "geology",
      style: "default",
      version: capabilities.version,
    });

    expect(tileUrl).toContain("REQUEST=GetMap");
    expect(tileUrl).toContain("LAYERS=geology");
    expect(tileUrl).toContain("CRS=EPSG%3A3857");
    expect(tileUrl).toContain("BBOX={bbox-epsg-3857}");
  });

  it("discovers WMTS layers and translates matrix placeholders", async () => {
    const xml = `<?xml version="1.0"?>
      <Capabilities xmlns="http://www.opengis.net/wmts/1.0"
        xmlns:ows="http://www.opengis.net/ows/1.1" version="1.0.0">
        <ows:ServiceIdentification>
          <ows:Title>GeoMoz Demo WMTS</ows:Title>
        </ows:ServiceIdentification>
        <Contents>
          <Layer>
            <ows:Title>Satélite</ows:Title>
            <ows:Identifier>satellite</ows:Identifier>
            <Style isDefault="true">
              <ows:Title>Default</ows:Title>
              <ows:Identifier>default</ows:Identifier>
            </Style>
            <Format>image/png</Format>
            <TileMatrixSetLink>
              <TileMatrixSet>WebMercatorQuad</TileMatrixSet>
            </TileMatrixSetLink>
            <ResourceURL resourceType="tile" format="image/png"
              template="https://tiles.example.test/satellite/{TileMatrix}/{TileCol}/{TileRow}.png"/>
          </Layer>
          <TileMatrixSet>
            <ows:Identifier>WebMercatorQuad</ows:Identifier>
            <ows:SupportedCRS>http://www.opengis.net/def/crs/EPSG/0/3857</ows:SupportedCRS>
            <TileMatrix><ows:Identifier>0</ows:Identifier></TileMatrix>
            <TileMatrix><ows:Identifier>1</ows:Identifier></TileMatrix>
            <TileMatrix><ows:Identifier>2</ows:Identifier></TileMatrix>
          </TileMatrixSet>
        </Contents>
      </Capabilities>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(xml, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        })
      )
    );

    const capabilities = await fetchWmtsCapabilities(
      "https://maps.example.test/wmts"
    );
    const layer = capabilities.layers[0];
    const matrixSet = compatibleWmtsMatrixSets(capabilities, layer)[0];

    expect(capabilities.title).toBe("GeoMoz Demo WMTS");
    expect(layer.identifier).toBe("satellite");
    expect(matrixSet.identifier).toBe("WebMercatorQuad");

    const tileUrl = createWmtsTileUrl({
      capabilities,
      layer,
      matrixSet,
      style: "default",
    });

    expect(tileUrl).toBe(
      "https://tiles.example.test/satellite/{z}/{x}/{y}.png"
    );
  });

  it("validates XYZ templates instead of accepting non-tiled URLs", () => {
    expect(
      validateXyzTemplate("https://tiles.example.test/{z}/{x}/{y}.png")
    ).toContain("{z}");
    expect(() =>
      validateXyzTemplate("https://tiles.example.test/static.png")
    ).toThrow(/template XYZ\/WMTS/i);
  });

  it("connects to STAC, searches COG assets and signs Planetary Computer lazily", async () => {
    const unsigned =
      "https://ai4edataeuwest.blob.core.windows.net/demo/item-red.tif";
    const signed = `${unsigned}?sp=rl&sig=fresh`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === PLANETARY_COMPUTER_STAC) {
        return new Response(
          JSON.stringify({
            id: "planetary-computer",
            title: "Planetary Computer",
            links: [
              { rel: "search", href: `${PLANETARY_COMPUTER_STAC}/search` },
              { rel: "data", href: `${PLANETARY_COMPUTER_STAC}/collections` },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/collections")) {
        return new Response(
          JSON.stringify({
            collections: [{ id: "sentinel-2-l2a", title: "Sentinel-2 L2A" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/search")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                id: "S2-demo",
                collection: "sentinel-2-l2a",
                geometry: null,
                properties: { datetime: "2026-01-01T10:00:00Z" },
                assets: {
                  red: {
                    href: unsigned,
                    type: "image/tiff; application=geotiff; profile=cloud-optimized",
                    roles: ["data"],
                  },
                },
              },
            ],
            links: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.startsWith("https://planetarycomputer.microsoft.com/api/sas/v1/sign")) {
        return new Response(
          JSON.stringify({
            href: signed,
            "msft:expiry": "2099-01-01T00:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const connection = await connectStacApi(PLANETARY_COMPUTER_STAC);
    const items = await searchStacItems(connection, {
      collection: "sentinel-2-l2a",
      limit: 10,
    });
    const asset = stacRasterAssets(items[0])[0];

    expect(connection.collections[0].id).toBe("sentinel-2-l2a");
    expect(asset.key).toBe("red");

    const resolved = await resolveStacAssetHref({
      catalogUrl: connection.url,
      collectionId: "sentinel-2-l2a",
      itemId: items[0].id,
      assetKey: asset.key,
      href: asset.href,
    });
    expect(resolved).toBe(signed);
  });

  it("discovers and paginates OGC API Features with an AOI bbox", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://features.example.test") {
        return new Response(
          JSON.stringify({
            title: "Demo Features",
            links: [
              {
                rel: "data",
                href: "https://features.example.test/collections",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "https://features.example.test/collections") {
        return new Response(
          JSON.stringify({
            collections: [
              {
                id: "roads",
                title: "Roads",
                links: [
                  {
                    rel: "items",
                    href: "https://features.example.test/collections/roads/items",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/collections/roads/items") && !url.includes("page=2")) {
        expect(url).toContain("bbox=30%2C-27%2C41%2C-10");
        return new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [32, -25] },
                properties: { name: "A" },
              },
            ],
            links: [
              {
                rel: "next",
                href: "https://features.example.test/collections/roads/items?page=2",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/geo+json" } }
        );
      }
      if (url.includes("page=2")) {
        return new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [33, -24] },
                properties: { name: "B" },
              },
            ],
            links: [],
          }),
          { status: 200, headers: { "Content-Type": "application/geo+json" } }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const connection = await connectOgcApiFeatures(
      "https://features.example.test"
    );
    const result = await importOgcApiFeatures(connection.collections[0], {
      bbox: [30, -27, 41, -10],
      maxFeatures: 10,
    });

    expect(connection.collections[0].id).toBe("roads");
    expect(result.geojson.features).toHaveLength(2);
    expect(result.fields).toEqual(["name"]);
    expect(result.geometryType).toBe("Point");
  });
});

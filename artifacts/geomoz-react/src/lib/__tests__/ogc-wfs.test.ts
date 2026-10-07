import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWfsCapabilities,
  importWfsFeatureType,
} from "../ogc-wfs";

describe("GeoMoz WFS client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("discovers FeatureTypes from WFS GetCapabilities", async () => {
    const capabilities = `<?xml version="1.0" encoding="UTF-8"?>
      <wfs:WFS_Capabilities
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1"
        version="2.0.0">
        <wfs:FeatureTypeList>
          <wfs:FeatureType>
            <wfs:Name>geomoz:falhas</wfs:Name>
            <wfs:Title>Falhas Geológicas</wfs:Title>
            <wfs:DefaultCRS>urn:ogc:def:crs:EPSG::4326</wfs:DefaultCRS>
            <ows:WGS84BoundingBox>
              <ows:LowerCorner>30 -27</ows:LowerCorner>
              <ows:UpperCorner>41 -10</ows:UpperCorner>
            </ows:WGS84BoundingBox>
          </wfs:FeatureType>
        </wfs:FeatureTypeList>
      </wfs:WFS_Capabilities>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(capabilities, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        })
      )
    );

    const result = await fetchWfsCapabilities(
      "https://example.test/geoserver/wfs?service=WFS&request=GetCapabilities"
    );

    expect(result.version).toBe("2.0.0");
    expect(result.featureTypes).toHaveLength(1);
    expect(result.featureTypes[0]).toMatchObject({
      name: "geomoz:falhas",
      title: "Falhas Geológicas",
      defaultCrs: "urn:ogc:def:crs:EPSG::4326",
      wgs84Bounds: [30, -27, 41, -10],
    });
    expect(result.endpoint).not.toContain("request=");
  });

  it("imports WFS GeoJSON into a FeatureCollection", async () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [32.5, -25.9],
              [33.1, -25.4],
            ],
          },
          properties: {
            nome: "Falha A",
            classe: "normal",
          },
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(collection), {
          status: 200,
          headers: { "Content-Type": "application/geo+json" },
        })
      )
    );

    const result = await importWfsFeatureType({
      endpoint: "https://example.test/geoserver/wfs",
      version: "2.0.0",
      typeName: "geomoz:falhas",
      title: "Falhas Geológicas",
      maxFeatures: 5000,
      wgs84Bounds: [30, -27, 41, -10],
    });

    expect(result.name).toBe("Falhas Geológicas");
    expect(result.featureCount).toBe(1);
    expect(result.geometryType).toBe("LineString");
    expect(result.fields).toEqual(expect.arrayContaining(["nome", "classe"]));
    expect(result.geojson.features[0].geometry?.type).toBe("LineString");
  });
});

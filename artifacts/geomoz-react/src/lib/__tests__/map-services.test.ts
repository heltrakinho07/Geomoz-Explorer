import { describe, expect, it } from "vitest";
import { createManualMapService, isTmsService, isWmsService } from "../map-services";

describe("GeoMoz manual map services", () => {
  it("supports public XYZ with escaped attribution and correct tile orientation", () => {
    const tile = createManualMapService({
      kind: "xyz", name: "Ortofoto", url: "https://tiles.example.org/{z}/{x}/{y}.png",
      attribution: '<img src=x onerror=alert(1)>',
    });
    expect(tile.kind).toBe("xyz");
    expect(tile.url).toContain("{z}/{x}/{y}");
    expect(isTmsService(tile)).toBe(false);
    expect(tile.attribution).toContain("&lt;img");
    expect(tile.attribution).not.toContain("<img");
  });

  it("supports bottom-origin TMS and namespace-qualified WMS layers", () => {
    const tms = createManualMapService({
      kind: "tms", name: "TMS", url: "https://tiles.example.org/{z}/{x}/{y}.png",
    });
    expect(isTmsService(tms)).toBe(true);
    const wms = createManualMapService({
      kind: "wms", name: "Geologia", url: "https://maps.example.org/geoserver/wms",
      layers: "geologia:unidades,geologia:falhas",
    });
    expect(isWmsService(wms)).toBe(true);
    expect(wms.layers).toBe("geologia:unidades,geologia:falhas");
    expect(wms.version).toBe("1.1.1");
    expect(wms.format).toBe("image/png");
    expect(wms.transparent).toBe(true);
  });

  it("rejects private endpoints, insecure protocols and credentials", () => {
    for (const url of [
      "http://tiles.example.org/{z}/{x}/{y}.png",
      "https://localhost/{z}/{x}/{y}.png",
      "https://192.168.0.10/{z}/{x}/{y}.png",
      "https://tiles.example.org/{z}/{x}/{y}.png?token=secret",
      "https://alice:secret@tiles.example.org/{z}/{x}/{y}.png",
    ]) {
      expect(() => createManualMapService({ kind: "xyz", name: "A", url })).toThrow();
    }
  });

  it("rejects unsupported templates, missing WMS layers and malformed WMS URLs", () => {
    expect(() => createManualMapService({
      kind: "xyz", name: "A", url: "https://tiles.example.org/{quadkey}.png",
    })).toThrow(/marcadores|exige/);
    expect(() => createManualMapService({
      kind: "wms", name: "A", url: "https://maps.example.org/wms", layers: "",
    })).toThrow(/camadas WMS/);
    expect(() => createManualMapService({
      kind: "wms", name: "A", url: "https://maps.example.org/wms?api_key=x", layers: "roads",
    })).toThrow(/chaves/);
  });
});

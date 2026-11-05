import { afterEach, describe, expect, it, vi } from "vitest";
import { GISWidgetRegistry, gisWidgetRegistry } from "../gis-widget-registry";
import { createFeatureInspector } from "../gis-feature-inspector";

afterEach(() => document.body.replaceChildren());

describe("GeoMoz GIS widgets", () => {
  it("rejects duplicate and invalid widgets, supports order and unregister", () => {
    const registry = new GISWidgetRegistry();
    const unregister = registry.register({id:"first", title:"B", category:"vector", load:async()=>1});
    registry.register({id:"second", title:"A", category:"vector", load:async()=>2});
    expect(registry.list({mapId:"test"}).map(w => w.id)).toEqual(["second","first"]);
    expect(() => registry.register({id:"first", title:"X", category:"vector", load:async()=>0})).toThrow(/duplicado/);
    expect(() => registry.register({id:"bad id", title:"X", category:"vector", load:async()=>0})).toThrow(/inválido/);
    unregister();
    expect(registry.get("first")).toBeUndefined();
  });
  it("loads activated widgets on demand and applies context restrictions", async () => {
    expect(gisWidgetRegistry.list({mapId:"test"}, "vector")).toHaveLength(0);
    expect(gisWidgetRegistry.list({mapId:"test",layerId:"layer-1"}, "vector").map(w=>w.id)).toContain("feature-inspector");
    const module = await gisWidgetRegistry.activate("feature-inspector", {mapId:"test",layerId:"layer-1"}) as typeof import("../gis-feature-inspector");
    expect(module.createFeatureInspector).toBeTypeOf("function");
    await expect(gisWidgetRegistry.activate("feature-inspector",{mapId:"test"})).rejects.toThrow(/indisponível/);
  });
});
describe("Feature inspector", () => {
  it("renders all properties safely, filters and exposes coordinates", () => {
    const properties = Object.fromEntries(Array.from({length: 25},(_,i)=>[`FIELD_${i}`,`Value ${i}`]));
    properties.FIELD_24 = "<img src=x onerror=alert(1)>";
    const root = createFeatureInspector("Geologia", properties, {lng:32.5,lat:-25.8});
    document.body.append(root);
    expect(root.querySelectorAll("dt")).toHaveLength(25);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("25 atributos");
    expect(root.textContent).toContain("-25.800000, 32.500000");
    const search = root.querySelector("input")!;
    search.value="FIELD_24";
    search.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll("dt")).toHaveLength(1);
    search.value="nao-existe"; search.dispatchEvent(new Event("input"));
    expect(root.textContent).toContain("Nenhum atributo encontrado");
  });
  it("exports the complete attribute object", () => {
    const createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const anchor = vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(() => {});
    const root = createFeatureInspector("Test", {name:"A", number:2});
    root.querySelector("button")!.click();
    expect(createURL).toHaveBeenCalledOnce();
    expect(anchor).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledWith("blob:test");
    createURL.mockRestore(); revokeURL.mockRestore(); anchor.mockRestore();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Feature } from "geojson";
import { createSelectionInspector, numericFieldSummaries, selectedFeatureCollection, selectionKey, updateFeatureSelection, type SelectedMapFeature } from "../gis-feature-selection";
const feature = (id: number, value: number, extra: Record<string, unknown> = {}): Feature => ({
  type:"Feature", id, properties: {elevation:value, "rock type":"Basalt", ...extra},
  geometry: {type:"Point",coordinates:[32+id,-25]},
});
const selected = (id: number, value: number, extra: Record<string, unknown> = {}): SelectedMapFeature => {
  const item=feature(id,value,extra);
  return {key:selectionKey("geology",item),layerId:"geology",layerName:"Geologia",feature:item};
};
afterEach(() => document.body.replaceChildren());
describe("multi-feature selection", () => {
  it("replaces on plain click and toggles on shift, without duplicates", () => {
    const a=selected(1,10),b=selected(2,20);
    expect(updateFeatureSelection([a],b,false)).toEqual([b]);
    expect(updateFeatureSelection([a],a,true)).toEqual([]);
    expect(updateFeatureSelection([a],b,true)).toEqual([a,b]);
    expect(updateFeatureSelection([a],b,true,1)).toEqual([a]);
  });
  it("distinguishes layers and uses geometry when feature IDs are missing", () => {
    const a=feature(1,4);
    expect(selectionKey("A",a)).not.toEqual(selectionKey("B",a));
    delete a.id;
    const b=JSON.parse(JSON.stringify(a)) as Feature;
    expect(selectionKey("A",a)).toEqual(selectionKey("A",b));
    b.geometry={type:"Point",coordinates:[33,-25]};
    expect(selectionKey("A",a)).not.toEqual(selectionKey("A",b));
  });
  it("summarises only finite numeric attributes with correct denominators", () => {
    const summaries=numericFieldSummaries([selected(1,10),selected(2,20,{other:7}),
      selected(3,30,{other:"8", elevation:null})]);
    expect(summaries.find(s=>s.field==="elevation")).toEqual({field:"elevation",count:2,min:10,max:20,sum:30,mean:15});
    expect(summaries.find(s=>s.field==="other")).toEqual({field:"other",count:1,min:7,max:7,sum:7,mean:7});
  });
  it("exports a valid feature collection preserving layer IDs", () => {
    const data=selectedFeatureCollection([selected(1,10),selected(2,20)]);
    expect(data.type).toBe("FeatureCollection");
    expect(data.features).toHaveLength(2);
    expect(data.features[0].properties?.__geomoz_layer_id).toBe("geology");
  });
  it("renders safe statistics and clear/export actions", () => {
    const onClear=vi.fn();
    const root=createSelectionInspector([selected(1,10, {unsafe:"<img src=x onerror=alert(1)>"}),selected(2,20)],onClear);
    document.body.append(root);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("2 feição(ões)");
    expect(root.textContent).toContain("média 15");
    const createURL=vi.fn(()=>"blob:selection");
    const revokeURL=vi.fn();
    const previousCreate=URL.createObjectURL,previousRevoke=URL.revokeObjectURL;
    URL.createObjectURL=createURL;URL.revokeObjectURL=revokeURL;
    const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
    try {
      root.querySelectorAll("button")[0].click();
      expect(createURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(revokeURL).toHaveBeenCalledWith("blob:selection");
    } finally {URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;click.mockRestore();}
    root.querySelectorAll("button")[1].click();
    expect(onClear).toHaveBeenCalledOnce();
  });
});

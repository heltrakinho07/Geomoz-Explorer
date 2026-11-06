import {describe,it,expect} from "vitest";
import type {Feature} from "geojson";
import {categoricalFieldSummary, filterAttributeRows, toggleAttributeSelection} from "../gis-attribute-table";
const feature=(v:unknown):Feature=>({type:"Feature",geometry:{type:"Point",coordinates:[0,0]},properties:{lithology:v}});
describe("GIS table selection and categorical statistics",()=>{
  it("calculates frequencies with missing values and zero denominator",()=>{
    const result=categoricalFieldSummary([feature("Basalto"),feature("Basalto"),feature("Granito"),feature(null)],"lithology");
    expect(result).toEqual([
      {value:"Basalto",count:2,percent:50},
      {value:"(sem dados)",count:1,percent:25},
      {value:"Granito",count:1,percent:25},
    ]);
    expect(categoricalFieldSummary([],"lithology")).toEqual([]);
  });
  it("filters using original indices and does not truncate before filtering",()=>{
    const rows=Array.from({length:150},(_,featureIndex)=>({featureIndex,feature:feature(featureIndex)}));
    expect(filterAttributeRows(rows,[119,149],true).map(row=>row.featureIndex)).toEqual([119,149]);
    expect(filterAttributeRows(rows,[119,149],false)).toHaveLength(150);
    expect(filterAttributeRows(rows,[],true)).toEqual([]);
  });
  it("replaces and toggles selection, protects against invalid indices and caps additions",()=>{
    expect(toggleAttributeSelection([1],4,false)).toEqual([4]);
    expect(toggleAttributeSelection([1],4,true)).toEqual([1,4]);
    expect(toggleAttributeSelection([1,4],4,true)).toEqual([1]);
    expect(toggleAttributeSelection([1],-1,true)).toEqual([1]);
    expect(toggleAttributeSelection([1],NaN,true)).toEqual([1]);
    expect(toggleAttributeSelection([1],4,true,1)).toEqual([1]);
  });
});

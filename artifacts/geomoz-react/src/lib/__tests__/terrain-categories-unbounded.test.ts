import {describe,expect,it} from "vitest";
import {buildCategoricalRasterLegend} from "../terrain-raster-drape";

describe("GeoMoz 3D scientific categorical raster styling",()=>{
  it("preserves all categories beyond the former 128 class limit",()=>{
    const codes=Array.from({length:200},(_,i)=>i+300);
    const legend=buildCategoricalRasterLegend(codes);
    expect(legend).toHaveLength(codes.length);
    expect(legend.map(x=>x.value)).toEqual(codes);
    expect(legend.every(x=>/^#[a-f0-9]{6}$/i.test(x.color))).toBe(true);
    expect(new Set(legend.map(x=>x.color)).size).toBeGreaterThan(130);
  });
  it("preserves ESA WorldCover colours and soil texture labels",()=>{
    const world=buildCategoricalRasterLegend([10,20,30]);
    expect(world.map(x=>x.label)).toEqual(["Floresta","Arbustos","Pradarias"]);
    expect(world[0].color).toBe("#006400");
    const soil=buildCategoricalRasterLegend([1,2,3]);
    expect(soil.map(x=>x.label)).toEqual(["Textura 1","Textura 2","Textura 3"]);
  });
});

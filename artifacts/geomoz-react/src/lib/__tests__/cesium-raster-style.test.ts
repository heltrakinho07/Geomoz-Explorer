import {describe,it,expect} from "vitest";
import {invertPixel,rasterColor,rasterNoData,stretchValue} from "../cesium-raster-style";
describe("Cesium raster georeferencing and colour",()=>{
  it("inverts a rotated affine grid without a north-up restriction",()=>{
    const gt:[number,number,number,number,number,number]=[100,2,0.5,200,-0.25,-3];
    const x=gt[0]+23*gt[1]+71*gt[2], y=gt[3]+23*gt[4]+71*gt[5];
    const pixel=invertPixel(gt,x,y);expect(pixel[0]).toBeCloseTo(23);expect(pixel[1]).toBeCloseTo(71);
    expect(()=>invertPixel([0,1,1,0,1,1],2,2)).toThrow();
  });
  it("keeps nodata transparent while permitting an explicit override",()=>{
    expect(rasterNoData(-32768,-32768,"auto")).toBe(true);
    expect(rasterNoData(-32768,-32768,"off")).toBe(false);
    expect(rasterNoData(0,-32768,0)).toBe(true);expect(rasterNoData(NaN,null,"off")).toBe(true);
  });
  it("uses value breaks and custom colours for classified rasters",()=>{
    const style={rasterSymbology:{classified:true,ramp:"viridis",method:"manual" as const,classCount:2,breaks:[0,10,100],customColors:["#000000","#ffffff"]}};
    expect(rasterColor(9,[0,100],style)).toEqual([0,0,0]);
    expect(rasterColor(10,[0,100],style)).toEqual([255,255,255]);
    expect(rasterColor(9,[0,100],{...style,rasterState:{reversed:true}})).toEqual([255,255,255]);
  });
  it("handles constant rasters and gamma/stretch without division by zero",()=>{
    expect(stretchValue(5,[5,5])).toBe(0.5);
    expect(stretchValue(25,[0,100],"sqrt")).toBeCloseTo(0.5);
    expect(stretchValue(25,[0,100],"linear",2)).toBeCloseTo(0.5);
  });
});

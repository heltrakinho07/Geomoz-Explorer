import {describe,it,expect} from "vitest";
import {terrainProMetrics} from "../terrain-pro-metrics";
import type {TerrainMeshData} from "../terrain-webgl";
const make=(heights:(number|null)[]):TerrainMeshData=>({
  name:"Ramp",width:3,height:3,heights,
  bounds4326:[32,-25,32.01,-24.99],boundsMeters:[500000,7000000,500020,7000020],
  crs:"EPSG:32736",sourceCrs:"EPSG:32736",
  minElevation:100,maxElevation:120,meanElevation:110,validFraction:1,
  cellSizeMeters:[10,10],sourceWidth:3,sourceHeight:3
});
describe("Geomorfometria GeoMoz Pro: dados de pré-visualização",()=>{
 it("identifica aspecto de descida para oeste e calcula intervalos",()=>{
   const m=terrainProMetrics(make([100,110,120,100,110,120,100,110,120]));
   expect(m.dominantDownslopeAspect).toBe("O");
   expect(m.percentilesMeters.p50).toBe(110);
   expect(m.completeWindows).toBe(1);
   expect(m.meanTerrainRuggednessIndexMeters).toBeGreaterThan(0);
   expect(m.aspectHistogram.reduce((total,bin)=>total+bin.percent,0)).toBeCloseTo(100);
 });
 it("não inventa exposição em terreno horizontal",()=>{
   const m=terrainProMetrics(make(Array(9).fill(100)));
   expect(m.dominantDownslopeAspect).toBeNull();
   expect(m.meanLocalReliefMeters).toBe(0);
   expect(m.meanTerrainRuggednessIndexMeters).toBe(0);
 });
 it("exclui NoData e vizinhanças incompletas",()=>{
   const m=terrainProMetrics(make([null,110,120,100,110,120,100,110,120]));
   expect(m.validPixels).toBe(8);
   expect(m.completeWindows).toBe(0);
   expect(m.dominantDownslopeAspect).toBeNull();
 });
});

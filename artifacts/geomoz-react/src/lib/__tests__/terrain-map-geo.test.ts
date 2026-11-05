import { describe, expect, it } from "vitest";
import { validTerrainGeography, terrainProjection } from "../terrain-map-geo";
import type { TerrainMeshData } from "../terrain-webgl";
const terrain: TerrainMeshData = {
  name: "Manica",width:2,height:2,heights:[120,125,123,null],
  bounds4326:[32.99,-25.40,33.02,-25.30],boundsMeters:[500000,7190000,503000,7200000],
  crs:"EPSG:32736",sourceCrs:"EPSG:32736",minElevation:120,maxElevation:125,
  meanElevation:122.67,validFraction:.75,cellSizeMeters:[3000,10000],sourceWidth:2,sourceHeight:2
};
describe("Terrain Studio basemap georreferenciado",()=>{
  it("accepts projected DEM with NoData",()=>expect(validTerrainGeography(terrain)).toBe(true));
  it("converts WGS84 coordinates to DEM UTM coordinates",()=>{
    const [x,y]=terrainProjection(terrain)(33,-25.35);
    expect(x).toBeGreaterThan(490000);expect(x).toBeLessThan(510000);
    expect(y).toBeGreaterThan(7100000);expect(y).toBeLessThan(7300000);
  });
  it("rejects unsupported or invalid georeferencing",()=>{
    expect(validTerrainGeography({...terrain,crs:"unknown"})).toBe(false);
    expect(validTerrainGeography({...terrain,bounds4326:[0,0,0,0]})).toBe(false);
  });
});

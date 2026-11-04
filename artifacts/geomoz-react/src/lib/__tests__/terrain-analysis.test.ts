import { describe, expect, it } from "vitest";
import type { TerrainMeshData } from "../terrain-webgl";
import {
  sampleTerrain, terrainProfile, terrainToGeographic,
  previewContours, terrainSlopeSummary,
} from "../terrain-analysis";

function plane(): TerrainMeshData {
  return {
    name: "DEM sintético", width:3,height:3,
    heights:[0,10,20,10,20,30,20,30,40],
    bounds4326:[0,0,0.002,0.002], boundsMeters:[0,0,200,200],
    crs:"EPSG:3857",sourceCrs:"EPSG:3857",
    minElevation:0,maxElevation:40,meanElevation:20,
    validFraction:1,cellSizeMeters:[100,100],sourceWidth:3,sourceHeight:3,
  };
}
describe("GeoMoz terrain analytical preview",()=>{
  it("interpolates real height cells in metric projected coordinates",()=>{
    const m=plane();
    expect(sampleTerrain(m,100,100)).toBeCloseTo(20);
    expect(sampleTerrain(m,50,150)).toBeCloseTo(10);
    expect(sampleTerrain(m,-1,100)).toBe(null);
  });
  it("computes A to B metric distance and CSV-ready altitudes",()=>{
    const m=plane();
    const a=terrainToGeographic(m,10,100);
    const b=terrainToGeographic(m,190,100);
    const p=terrainProfile(m,a,b,11);
    expect(p.distanceM).toBeCloseTo(180,2);
    expect(p.points).toHaveLength(11);
    expect(p.points[0].elevationM).toBeCloseTo(11);
    expect(p.points[10].elevationM).toBeCloseTo(29);
    expect(p.averageGradePct).toBeCloseTo(10);
    expect(p.surfaceDistanceM).toBeGreaterThan(p.distanceM);
  });
  it("preserves NoData instead of interpolating through missing cells",()=>{
    const m=plane();
    m.heights[4]=null;
    expect(sampleTerrain(m,100,100)).toBeNull();
    expect(()=>terrainProfile(m,terrainToGeographic(m,90,90),terrainToGeographic(m,110,110),5)).toThrow();
  });
  it("exports georeferenced contours with elevation attributes",()=>{
    const m=plane();
    const c=previewContours(m,10);
    expect(c.type).toBe("FeatureCollection");
    expect(c.features.length).toBeGreaterThan(0);
    expect(c.features[0].geometry.type).toBe("LineString");
    expect(c.features[0].properties.source).toBe("DEM de pré-visualização");
    const [lon,lat]=c.features[0].geometry.coordinates[0];
    expect(lon).toBeGreaterThanOrEqual(0);
    expect(lat).toBeGreaterThanOrEqual(0);
    expect(lon).toBeLessThan(0.003);
    expect(lat).toBeLessThan(0.003);
    expect(()=>previewContours(m,0)).toThrow();
    expect(()=>previewContours(m,.01)).toThrow(/equidistância/);
  });
  it("calculates slope statistics using DEM spacing",()=>{
    const s=terrainSlopeSummary(plane());
    expect(s.validCells).toBe(1);
    expect(s.meanDeg).toBeCloseTo(8.049,2);
    expect(s.maxDeg).toBeCloseTo(s.meanDeg);
  });
});

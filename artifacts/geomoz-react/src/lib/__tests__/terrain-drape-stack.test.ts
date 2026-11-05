import {describe,expect,it} from "vitest";
import {reorderDrapes,visibleDrapeCount,type TerrainDrapeLayer} from "../terrain-drape-stack";
import {validateTerrainXYZTemplate} from "../terrain-xyz-drape";
import {continuousRasterColor} from "../terrain-raster-drape";

const make=(id:string):TerrainDrapeLayer=>({
  id,name:id,imageDataUrl:"data:image/png;base64,aGVsbG8=",kind:"continuous",
  visible:true,opacity:.7,blend:"normal",coverage:1
});
describe("GeoMoz DEM 3D thematic stack",()=>{
  it("changes priority without destroying source layers",()=>{
    const initial=[make("landcover"),make("ndvi"),make("geology")];
    const changed=reorderDrapes(initial,"ndvi","up");
    expect(changed.map(l=>l.id)).toEqual(["landcover","geology","ndvi"]);
    expect(initial.map(l=>l.id)).toEqual(["landcover","ndvi","geology"]);
    expect(reorderDrapes(initial,"landcover","down")).toEqual(initial);
  });
  it("honours visibility and zero opacity",()=>{
    expect(visibleDrapeCount([make("a"),{...make("b"),visible:false},
      {...make("c"),opacity:0}])).toBe(1);
  });
  it("generates continuous colours for negative and positive vegetation index",()=>{
    const min=continuousRasterColor(-1,-1,1,"ndvi");
    const max=continuousRasterColor(1,-1,1,"ndvi");
    expect(min).not.toEqual(max);
    expect(max[1]).toBeGreaterThan(max[0]);
    expect(continuousRasterColor(Number.POSITIVE_INFINITY,-1,1,"ndwi")).toHaveLength(3);
  });
});
describe("Licensed XYZ basemap-as-texture",()=>{
  it("accepts a user-managed HTTPS XYZ service",()=>{
    expect(validateTerrainXYZTemplate(
      "https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=customer"
    )).toContain("{z}");
  });
  it("prevents bulk mosaicking community/free visual tile servers",()=>{
    for(const endpoint of [
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://server.arcgisonline.com/ArcGIS/tile/{z}/{y}/{x}",
      "https://mt1.google.com/vt?x={x}&y={y}&z={z}"
    ])expect(()=>validateTerrainXYZTemplate(endpoint)).toThrow();
  });
  it("rejects missing coordinates, cleartext and local endpoints",()=>{
    for(const endpoint of [
      "https://tiles.example.com/current.png",
      "http://tiles.example.com/{z}/{x}/{y}.png",
      "https://localhost/{z}/{x}/{y}.png"
    ])expect(()=>validateTerrainXYZTemplate(endpoint)).toThrow();
  });
});

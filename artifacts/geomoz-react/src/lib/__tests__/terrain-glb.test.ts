import { describe, expect, it } from "vitest";
import type { TerrainMeshData } from "../terrain-webgl";
import { encodeTerrainGLB } from "../terrain-glb";
import { buildTerrainLodIndices } from "../terrain-webgl";

function surface(): TerrainMeshData {
  return {
    name: "Manica_DEM", width:3,height:3,
    heights: [10,20,30,20,null,40,30,40,50],
    boundsMeters: [600000,7999900,600200,8000100],
    bounds4326: [33.0,-18.9,33.1,-18.8],
    crs: "EPSG:32736", sourceCrs: "EPSG:32736",
    minElevation:10,maxElevation:50,meanElevation:30,
    validFraction:8/9,cellSizeMeters:[100,100],sourceWidth:3,sourceHeight:3
  };
}
function decodeGLB(blob: Uint8Array) {
  const view = new DataView(blob.buffer,blob.byteOffset,blob.byteLength);
  const jsonLength=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(blob.slice(20,20+jsonLength)).trimEnd());
  const binOffset=20+jsonLength;
  return {view,json,binOffset,bin:blob.subarray(binOffset+8)};
}
describe("GeoMoz glTF 2.0 GLB terrain export",()=>{
  it("writes a valid self-contained GLB with metric positions, NoData-safe topology and CRS metadata",()=>{
    const bytes=encodeTerrainGLB(surface(),2,"hypsometric");
    const {view,json,binOffset,bin}=decodeGLB(bytes);
    expect(view.getUint32(0,true)).toBe(0x46546c67);
    expect(view.getUint32(4,true)).toBe(2);
    expect(view.getUint32(8,true)).toBe(bytes.byteLength);
    expect(view.getUint32(binOffset+4,true)).toBe(0x004e4942);
    expect(view.getUint32(binOffset,true)).toBe(bin.length);
    expect(json.asset.version).toBe("2.0");
    expect(json.extras.workingCrs).toBe("EPSG:32736");
    expect(json.extras.boundsMeters).toEqual(surface().boundsMeters);
    expect(json.extras.verticalExaggeration).toBe(2);
    expect(json.meshes[0].primitives[0].attributes.COLOR_0).toBe(3);
    expect(json.accessors[4].count).toBe(6); // only two valid triangles around missing centre
    const positions=json.bufferViews[0];
    const pos=new DataView(bin.buffer,bin.byteOffset+positions.byteOffset,positions.byteLength);
    expect(pos.getFloat32(0,true)).toBeCloseTo(-100);
    expect(pos.getFloat32(4,true)).toBeCloseTo(0);
    expect(pos.getFloat32(8,true)).toBeCloseTo(100);
  });
  it("embeds an RGB texture in the binary bufferView and references it as glTF material",()=>{
    const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);
    const bytes=encodeTerrainGLB(surface(),1,"imagery",{bytes:png,mimeType:"image/png"});
    const {json,bin}=decodeGLB(bytes);
    expect(json.materials[0].pbrMetallicRoughness.baseColorTexture.index).toBe(0);
    expect(json.images[0].mimeType).toBe("image/png");
    expect(json.meshes[0].primitives[0].attributes.COLOR_0).toBeUndefined();
    const image=json.bufferViews[json.images[0].bufferView];
    expect([...bin.subarray(image.byteOffset,image.byteOffset+image.byteLength)]).toEqual([...png]);
  });
  it("rejects invalid elevations, too-large grids or unsafe textures",()=>{
    expect(()=>encodeTerrainGLB({...surface(),heights:Array(9).fill(null)},1,"hypsometric")).toThrow();
    expect(()=>encodeTerrainGLB(surface(),0,"grayscale")).toThrow();
    expect(()=>encodeTerrainGLB(surface(),2,"imagery",{
      bytes:new Uint8Array(8*1024*1024+1),mimeType:"image/png"
    })).toThrow();
  });
  it("supports the full 193×193 DEM without argument overflows",()=>{
    const m=surface();
    m.width=193;m.height=193;m.heights=Array(193*193).fill(150);
    const bytes=encodeTerrainGLB(m,2,"grayscale");
    const {json}=decodeGLB(bytes);
    expect(json.accessors[4].count).toBe(192*192*6);
    expect(bytes.length).toBeGreaterThan(193*193*32);
  });
});
describe("LOD rendering indices",()=>{
  it("reduces triangles without bridging NoData holes",()=>{
    const heights=Array(9*9).fill(10) as (number|null)[];
    const full=buildTerrainLodIndices(heights,9,9,1);
    const medium=buildTerrainLodIndices(heights,9,9,2);
    const low=buildTerrainLodIndices(heights,9,9,4);
    expect(full.length).toBe(8*8*6);
    expect(medium.length).toBe(4*4*6);
    expect(low.length).toBe(2*2*6);
    heights[4*9+4]=null;
    expect(buildTerrainLodIndices(heights,9,9,4).length).toBeLessThan(low.length);
    expect(buildTerrainLodIndices(heights,9,9,1).length).toBeLessThan(full.length);
  });
});

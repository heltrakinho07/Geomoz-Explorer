import test from "node:test";
import assert from "node:assert/strict";
import {warpRaster,rasterWarpArgs,GEOMOZ_WARP_LIMIT} from "../assets/workbench/geomoz-raster-warp.ts";

const mask={type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[[33,-25],[34,-25],[34,-24],[33,-25]]]}}]};
function fixture(fail=false){
 const closed=[],calls=[];
 const gdal={
  async open(file){const d={path:"/input/"+file.name};calls.push(["open",file.name]);return {datasets:[d]};},
  async close(d){closed.push(d.path);},
  async gdalwarp(d,args){calls.push(["warp",...args]);if(fail)throw Error("warp failed");return "result";},
  async getFileBytes(){return new Uint8Array([1,2,3]);},
 };
 return {gdal,closed,calls};
}
test("reprojection enforces explicit CRS and categorical-safe nearest resampling",async()=>{
 const {gdal,closed,calls}=fixture();
 const output=await warpRaster(gdal,"reproject",new ArrayBuffer(4),{dst_crs:"epsg:32736",resampling:"nearest"});
 assert.deepEqual([...new Uint8Array(output)],[1,2,3]);
 assert.ok(calls[1].includes("EPSG:32736"));
 assert.ok(calls[1].includes("near"));
 assert.deepEqual(closed,["/input/input.tif"]);
 assert.throws(()=>rasterWarpArgs("reproject",{dst_crs:"-overwrite"}),/SRC válido/);
});
test("mask runs a real cutline with cropping and transparency; closes both inputs",async()=>{
 const {gdal,closed,calls}=fixture();
 await warpRaster(gdal,"clip-mask",new ArrayBuffer(4),{crop:true,all_touched:true},mask);
 assert.deepEqual(calls[2],["warp","-of","COG","-co","COMPRESS=DEFLATE","-cutline","/input/mask.geojson","-dstalpha","-crop_to_cutline","-wo","CUTLINE_ALL_TOUCHED=TRUE"]);
 assert.deepEqual(closed,["/input/mask.geojson","/input/input.tif"]);
});
test("failed warp releases datasets without returning a success",async()=>{
 const {gdal,closed}=fixture(true);
 await assert.rejects(warpRaster(gdal,"clip-mask",new ArrayBuffer(4),{},mask),/warp failed/);
 assert.equal(closed.length,2);
});
test("invalid masks and oversized files fail before GDAL opens anything",async()=>{
 const {gdal,calls}=fixture();
 await assert.rejects(warpRaster(gdal,"clip-mask",new ArrayBuffer(4),{},{type:"FeatureCollection",features:[]}),/polígonos/);
 await assert.rejects(warpRaster(gdal,"reproject",new ArrayBuffer(GEOMOZ_WARP_LIMIT+1),{dst_crs:"EPSG:4326"}),/64 MB/);
 assert.deepEqual(calls,[]);
});

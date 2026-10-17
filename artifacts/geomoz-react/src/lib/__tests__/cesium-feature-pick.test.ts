import {describe,it,expect} from "vitest";
import type {FeatureCollection} from "geojson";
import {pickWorkspaceFeature} from "../cesium-feature-pick";
const project=(p:number[])=>({x:p[0],y:p[1]});
const layer=(id:string,geojson:FeatureCollection,visible=true)=>({id,name:id,geojson,visible});
describe("2D feature selection",()=>{
  it("selects the visible top polygon while retaining holes",()=>{
    const polygon:FeatureCollection={type:"FeatureCollection",features:[{type:"Feature",properties:{name:"Parcel"},geometry:{type:"Polygon",coordinates:[[[0,0],[100,0],[100,100],[0,100],[0,0]],[[40,40],[40,60],[60,60],[60,40],[40,40]]]}}]};
    expect(pickWorkspaceFeature([layer("lower",polygon),layer("upper",polygon)],[20,20],{x:20,y:20},project)?.layerId).toBe("upper");
    expect(pickWorkspaceFeature([layer("hidden",polygon,false)],[20,20],{x:20,y:20},project)).toBeNull();
    expect(pickWorkspaceFeature([layer("hole",polygon)],[50,50],{x:50,y:50},project)).toBeNull();
  });
  it("uses a pixel tolerance for points and line segments",()=>{
    const line:FeatureCollection={type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:[[0,0],[100,0]]}}]};
    expect(pickWorkspaceFeature([layer("road",line)],[50,7],{x:50,y:7},project)?.layerId).toBe("road");
    expect(pickWorkspaceFeature([layer("road",line)],[50,9],{x:50,y:9},project)).toBeNull();
  });
});

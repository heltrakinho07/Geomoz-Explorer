/** Decode the pinned MLT format into the common tile geometry contract. */
import {decodeTile} from "@maplibre/mlt";
import {getGeometry} from "@maplibre/mlt/dist/vector/featureTablesToGeoJson.js";
import type {Geometry,Position} from "geojson";
type TilePoint={x:number;y:number};
function geometryParts(geometry:Geometry):{type:number;rings:Position[][]} {
  switch(geometry.type){
    case "Point":return {type:1,rings:[[geometry.coordinates]]};
    case "MultiPoint":return {type:1,rings:[geometry.coordinates]};
    case "LineString":return {type:2,rings:[geometry.coordinates]};
    case "MultiLineString":return {type:2,rings:geometry.coordinates};
    case "Polygon":return {type:3,rings:geometry.coordinates};
    case "MultiPolygon":return {type:3,rings:geometry.coordinates.flat()};
    default:throw new Error("Geometria MLT não suportada: "+geometry.type);
  }
}
export async function decodeMltLayers(data:Uint8Array) {
  return Object.fromEntries(decodeTile(data).map(table=>{
    const features=table.getFeatures();
    return [table.name,{length:features.length,feature(index:number){
      const {type,rings}=geometryParts(getGeometry(features[index].geometry));
      return {type,extent:table.extent,loadGeometry:():TilePoint[][]=>rings.map(ring=>ring.map(p=>({x:p[0],y:p[1]})))};
    }}];
  }));
}

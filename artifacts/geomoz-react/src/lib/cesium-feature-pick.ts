import {booleanPointInPolygon} from "@turf/turf";
import type {FeatureCollection,Geometry,Position} from "geojson";
interface Layer {id:string;name:string;visible:boolean;geojson:FeatureCollection}
type Pixel={x:number;y:number};
function segmentDistance(p:Pixel,a:Pixel,b:Pixel):number {
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
/** A screen tolerance for points/lines; exact polygon tests retain interior holes. */
export function pickWorkspaceFeature(layers:Layer[],lonlat:[number,number],pixel:Pixel,
  project:(position:Position)=>Pixel|undefined) {
  const nearPoint=(p:Position)=>{const q=project(p);return !!q&&Math.hypot(q.x-pixel.x,q.y-pixel.y)<=8;};
  const nearLine=(line:Position[])=>line.some((p,i)=>{
    if(!i)return nearPoint(p);
    const a=project(line[i-1]),b=project(p);return !!a&&!!b&&segmentDistance(pixel,a,b)<=8;
  });
  const hit=(g:Geometry):boolean=>{
    switch(g.type){
      case "Point":return nearPoint(g.coordinates);
      case "MultiPoint":return g.coordinates.some(nearPoint);
      case "LineString":return nearLine(g.coordinates);
      case "MultiLineString":return g.coordinates.some(nearLine);
      case "Polygon":case "MultiPolygon":return booleanPointInPolygon(lonlat,g);
      case "GeometryCollection":return g.geometries.some(hit);
    }
  };
  // Local vectors are appended by the project, so the last feature is on top.
  for(const layer of [...layers].reverse())if(layer.visible){
    for(const feature of [...layer.geojson.features].reverse()){
      if(!feature.geometry)continue;
      try{if(hit(feature.geometry))return {layerId:layer.id,name:String(feature.properties?.name??layer.name),properties:feature.properties??{}};}
      catch{/* Skip malformed geometry without losing selection of other layers. */}
    }
  }
  return null;
}

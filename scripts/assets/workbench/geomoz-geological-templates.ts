/** Native geological map templates. Geometries are not fabricated: all new
 * project layers begin empty and are populated through the geometry editor. */
import type { FeatureCollection } from "geojson";

export type GeologyLayerKind = "units"|"faults"|"measurements";
export const GEOLOGICAL_LAYER_TEMPLATES = [
  {kind:"units",name:"Unidades geológicas",geometry:"Polygon",
   fields:["unidade","codigo","litologia","idade","formacao","descricao","fonte"],
   style:{fillColor:"#d8b4fe",strokeColor:"#6d28d9",strokeWidth:1.4,fillOpacity:.72}},
  {kind:"faults",name:"Falhas e lineamentos",geometry:"LineString",
   fields:["nome","tipo","cinematica","direcao","mergulho","confianca","fonte"],
   style:{strokeColor:"#dc2626",strokeWidth:2.3}},
  {kind:"measurements",name:"Pontos de observação",geometry:"Point",
   fields:["estacao","litologia","azimute","mergulho","descricao","data","fonte"],
   style:{fillColor:"#f59e0b",strokeColor:"#0f172a",circleRadius:6}}
] as const;
export function emptyGeologyLayer():FeatureCollection{
  return {type:"FeatureCollection",features:[]};
}
export function uniqueGeologicalLayerName(existingNames:readonly string[],base:string):string{
  const used=new Set(existingNames.map(n=>n.toLocaleLowerCase()));
  if(!used.has(base.toLocaleLowerCase()))return base;
  let n=2;
  while(used.has((base+" ("+n+")").toLocaleLowerCase()))n++;
  return base+" ("+n+")";
}

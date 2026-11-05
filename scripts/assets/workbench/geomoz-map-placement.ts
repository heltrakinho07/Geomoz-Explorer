const number=(v:unknown,d:number,min:number,max:number)=>Math.max(min,Math.min(max,typeof v==='number'&&Number.isFinite(v)?v:d));
export function normalizeGeoMozMapFrame(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>,x=number(v.x,5,0,95),y=number(v.y,15,0,95);
 return {x,y,width:number(v.width,70,5,100-x),height:number(v.height,75,5,100-y)};
}
export function normalizeGeoMozLegendPlacement(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 return {x:number(v.x,77,0,95),y:number(v.y,15,0,95),scale:number(v.scale,1,.5,3)};
}

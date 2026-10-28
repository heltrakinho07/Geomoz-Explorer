export interface GeoMozLayoutItem {
 id:string; kind:'text'|'image'|'rectangle'; x:number; y:number; width:number; height:number;
 text:string; image:string; color:string; background:string; fontSize:number; locked:boolean; visible:boolean;
}
export function normalizeLayoutItems(value:unknown):GeoMozLayoutItem[]{
 if(!Array.isArray(value))return [];
 const n=(v:unknown,d:number,min:number,max:number)=>Math.min(max,Math.max(min,typeof v==='number'&&Number.isFinite(v)?v:d));
 const c=(v:unknown,d:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:d;
 let bytes=0;
 return value.slice(0,40).filter(v=>v&&typeof v==='object').map((v,i)=>{
 const x=n(v.x,10,0,99),y=n(v.y,10,0,99);
 let image=typeof v.image==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(v.image)&&v.image.length<2800000?v.image:'';
 bytes+=image.length;if(bytes>12000000)image='';
 return {id:String(v.id??'item-'+i).slice(0,100),kind:v.kind==='image'?'image':v.kind==='rectangle'?'rectangle':'text',x,y,width:n(v.width,30,1,100-x),height:n(v.height,10,1,100-y),text:typeof v.text==='string'?v.text.slice(0,2000):'',image,color:c(v.color,'#111827'),background:c(v.background,'#ffffff'),fontSize:n(v.fontSize,12,6,96),locked:!!v.locked,visible:v.visible!==false};
 });
}

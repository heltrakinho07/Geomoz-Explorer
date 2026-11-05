import type {GeoMozLayoutItem} from '@geolibre/core';
const images=new Map<string,HTMLImageElement>();
export async function prepareLayoutImages(items:GeoMozLayoutItem[]=[]){
 const active=new Set(items.map(i=>i.image));for(const key of images.keys())if(!active.has(key))images.delete(key);
 await Promise.all(items.filter(i=>i.kind==='image'&&i.image).map(async item=>{
  if(images.has(item.image))return;
  const image=new Image();image.src=item.image;await image.decode();if(image.width*image.height>16000000)throw Error('Imagem demasiado grande');images.set(item.image,image);
 }));
}
export function drawGeoMozItems(ctx:CanvasRenderingContext2D,W:number,H:number,items:GeoMozLayoutItem[]=[],pageWidthMm=297){
 for(const item of items){if(!item.visible)continue;
 const x=item.x*W/100,y=item.y*H/100,w=item.width*W/100,h=item.height*H/100;
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle=item.background;ctx.fillRect(x,y,w,h);
 if(item.kind==='image'){const img=images.get(item.image);if(img){const s=Math.min(w/img.width,h/img.height);ctx.drawImage(img,x+(w-img.width*s)/2,y+(h-img.height*s)/2,img.width*s,img.height*s);}}
 else if(item.kind==='rectangle'){ctx.strokeStyle=item.color;ctx.lineWidth=W/pageWidthMm*.3;ctx.strokeRect(x,y,w,h);}
 else {const font=item.fontSize*25.4/72*W/pageWidthMm;ctx.font=`${font}px sans-serif`;ctx.fillStyle=item.color;ctx.textAlign='left';ctx.textBaseline='top';let yy=y;
 for(const p of item.text.split('\n')){let line='';for(const word of p.split(' ')){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w&&line){ctx.fillText(line,x,yy);yy+=font*1.2;line=word;}else line=next;}ctx.fillText(line,x,yy);yy+=font*1.2;}}
 ctx.restore();
 }
}

/**
 * One compositing pipeline for georeferenced images on the DEM mesh.
 * Every source already occupies the same metric DEM extent. Transparent
 * NoData is preserved and the original GeoTIFF numeric values are untouched.
 */
export interface TerrainDrapeLayer {
  id:string;
  name:string;
  imageDataUrl:string;
  visible:boolean;
  opacity:number;
  kind:"classified"|"continuous"|"rgb"|"xyz";
  blend:"normal"|"multiply"|"screen";
  coverage:number;
  categories?:{value:number;label:string;color:string}[];
  range?:{min:number;max:number};
  palette?:"ndvi"|"ndwi"|"terrain";
  attribution?:string;
}

export function reorderDrapes<T extends {id:string}>(layers:readonly T[],id:string,direction:"up"|"down"):T[]{
  const result=[...layers],index=result.findIndex(l=>l.id===id);
  if(index===-1)return result;
  const next=index+(direction==="up"?1:-1);
  if(next<0||next>=result.length)return result;
  [result[index],result[next]]=[result[next],result[index]];
  return result;
}
export function visibleDrapeCount(layers:readonly TerrainDrapeLayer[]):number{
  return layers.filter(l=>l.visible&&l.opacity>0).length;
}
function loadImage(src:string):Promise<HTMLImageElement>{
  if(!/^data:image\/(png|jpeg|webp);base64,/i.test(src) && !src.startsWith("blob:"))return Promise.reject(
    Error("A textura deve ser uma imagem local produzida pelo GeoMoz."));
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(Error("Não foi possível abrir a textura georreferenciada."));
    img.src=src;
  });
}
/** Bottom to top painter ordering; opaque areas never fill underlying NoData. */
export async function composeTerrainDrapes(
  layers:readonly TerrainDrapeLayer[],size=1024,signal?:AbortSignal
):Promise<string|null>{
  const visible=layers.filter(l=>l.visible&&l.opacity>0);
  if(!visible.length)return null;
  const canvas=document.createElement("canvas");
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Canvas indisponível para composição de camadas 3D.");
  ctx.clearRect(0,0,size,size);
  for(const layer of visible){
    if(signal?.aborted)throw new DOMException("Composição cancelada.","AbortError");
    const image=await loadImage(layer.imageDataUrl);
    if(signal?.aborted)throw new DOMException("Composição cancelada.","AbortError");
    ctx.save();
    ctx.globalAlpha=Math.min(1,Math.max(0,layer.opacity));
    ctx.globalCompositeOperation=layer.blend==="multiply"?"multiply":layer.blend==="screen"?"screen":"source-over";
    ctx.drawImage(image,0,0,size,size);
    ctx.restore();
  }
  return canvas.toDataURL("image/png");
}

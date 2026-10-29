/** GeoMoz browser GDAL adapter. No local files or project data leave the browser. */
export const GEOMOZ_WARP_LIMIT = 64 * 1024 * 1024;
type Dataset = {path:string};
type Gdal<D extends Dataset> = {
  open(file:File):Promise<{datasets:D[]}>;
  close(dataset:D):Promise<void>;
  gdalwarp(dataset:D,args:string[],name:string):Promise<unknown>;
  getFileBytes(output:any):Promise<Uint8Array>;
};
type Mask = {type:string;features:{geometry:{type:string}|null}[]};

export function rasterWarpArgs(id:string, params:Record<string,unknown>, maskPath?:string):string[] {
  const args=["-of","COG","-co","COMPRESS=DEFLATE"];
  if(id==="reproject"){
    const crs=String(params.dst_crs??"").trim().toUpperCase();
    if(!/^EPSG:[1-9]\d{2,5}$/.test(crs))throw Error("Indique um SRC válido, por exemplo EPSG:32736.");
    const resampling=String(params.resampling??"nearest");
    if(!["nearest","bilinear","cubic"].includes(resampling))throw Error("Método de reamostragem inválido.");
    args.push("-t_srs",crs,"-r",resampling==="nearest"?"near":resampling);
  }else if(id==="clip-mask"){
    if(!maskPath)throw Error("Seleccione uma camada poligonal como máscara.");
    args.push("-cutline",maskPath,"-dstalpha");
    if(params.crop!==false)args.push("-crop_to_cutline");
    if(params.all_touched===true)args.push("-wo","CUTLINE_ALL_TOUCHED=TRUE");
  }else throw Error("Operação GDAL não suportada.");
  return args;
}

export async function warpRaster<D extends Dataset>(
  gdal:Gdal<D>, id:string, bytes:ArrayBuffer, params:Record<string,unknown>, mask?:Mask,
):Promise<ArrayBuffer>{
  if(!bytes.byteLength || bytes.byteLength>GEOMOZ_WARP_LIMIT)throw Error("O processamento local aceita rasters até 64 MB.");
  // Validate parameters before opening datasets or allocating GDAL resources.
  if(id==="reproject")rasterWarpArgs(id,params);
  if(id==="clip-mask"&&(!mask||mask.type!=="FeatureCollection"||!mask.features.length||
    mask.features.some(f=>!f.geometry||!["Polygon","MultiPolygon"].includes(f.geometry.type)))){
    throw Error("A máscara deve conter apenas polígonos.");
  }
  const opened:D[]=[];
  try{
    const raster=await gdal.open(new File([bytes],"input.tif",{type:"image/tiff"}));
    opened.push(...raster.datasets);
    const input=raster.datasets[0];
    if(!input)throw Error("Não foi possível abrir o raster.");
    let maskPath:string|undefined;
    if(id==="clip-mask"){
      const text=JSON.stringify(mask);
      if(text.length>8*1024*1024)throw Error("A máscara excede 8 MB.");
      const cutline=await gdal.open(new File([text],"mask.geojson",{type:"application/geo+json"}));
      opened.push(...cutline.datasets);
      maskPath=cutline.datasets[0]?.path;
    }
    const output=await gdal.gdalwarp(input,rasterWarpArgs(id,params,maskPath),"geomoz-result.tif");
    // Copy out of WASM memory before closing input datasets.
    return Uint8Array.from(await gdal.getFileBytes(output)).buffer;
  }finally{
    for(const dataset of opened.reverse())await gdal.close(dataset).catch(()=>undefined);
  }
}

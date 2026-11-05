import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, FileUp, Layers3, Loader2, Trash2, XCircle } from "lucide-react";
import type { TerrainMeshData } from "@/lib/terrain-webgl";
import {createTerrainRasterDrape,type TerrainRasterDrapeOptions} from "@/lib/terrain-raster-drape";
import {createTerrainXYZDrape,validateTerrainXYZTemplate} from "@/lib/terrain-xyz-drape";
import {reorderDrapes,type TerrainDrapeLayer} from "@/lib/terrain-drape-stack";

interface Props {
  terrain:TerrainMeshData|null;
  layers:TerrainDrapeLayer[];
  onAdd:(layer:TerrainDrapeLayer)=>void;
  onChange:(layers:TerrainDrapeLayer[])=>void;
}
export default function TerrainDrapePanel({terrain,layers,onAdd,onChange}:Props){
  const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<number|null>(null);
  const [error,setError]=useState("");
  const [renderer,setRenderer]=useState<NonNullable<TerrainRasterDrapeOptions["renderer"]>>("auto");
  const [palette,setPalette]=useState<NonNullable<TerrainRasterDrapeOptions["palette"]>>("ndvi");
  const [xyz,setXyz]=useState("");
  const [attribution,setAttribution]=useState("");
  const [rights,setRights]=useState(false);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  const update=(id:string,patch:Partial<TerrainDrapeLayer>)=>
    onChange(layers.map(item=>item.id===id?{...item,...patch}:item));
  const cancel=()=>{controller.current?.abort();controller.current=null;setBusy(false);setProgress(null);};
  async function loadRaster(file:File|undefined){
    if(!terrain||!file||busy)return;
    setError("");const abort=new AbortController();controller.current=abort;setBusy(true);setProgress(0);
    try{
      if(file.size<1||file.size>32*1024*1024||!/\.tiff?$/i.test(file.name))
        throw Error("Seleccione um GeoTIFF (.tif/.tiff) até 32 MB.");
      const prepared=await createTerrainRasterDrape(await file.arrayBuffer(),file.name,terrain,{
        renderer,palette,signal:abort.signal,onProgress:p=>setProgress(Math.round(p*100))
      });
      if(abort.signal.aborted)return;
      onAdd({...prepared,id:"drape-"+crypto.randomUUID(),kind:prepared.mode,visible:true,
        opacity:.82,blend:"normal"});
    }catch(cause){
      if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:"Falha ao importar raster.");
    }finally{
      if(controller.current===abort){controller.current=null;setBusy(false);setProgress(null);}
      if(input.current)input.current.value="";
    }
  }
  async function addXYZ(){
    if(!terrain||busy)return;
    setError("");
    if(!rights){setError("Confirme a licença para composição de mosaicos XYZ.");return;}
    if(!attribution.trim()){setError("Indique a atribuição do fornecedor XYZ.");return;}
    try{validateTerrainXYZTemplate(xyz);}
    catch(cause){setError(cause instanceof Error?cause.message:"Origem XYZ inválida.");return;}
    const abort=new AbortController();controller.current=abort;setBusy(true);setProgress(null);
    try{
      const prepared=await createTerrainXYZDrape(terrain,xyz,abort.signal);
      if(abort.signal.aborted)return;
      onAdd({id:"xyz-"+crypto.randomUUID(),name:"Mapa-base XYZ · "+attribution,
        imageDataUrl:prepared.imageDataUrl,kind:"xyz",visible:true,opacity:1,
        blend:"normal",coverage:prepared.coverage,attribution});
    }catch(cause){
      if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:"Falha na textura XYZ.");
    }finally{if(controller.current===abort){controller.current=null;setBusy(false);setProgress(null);}}
  }
  return <section data-testid="terrain-drape-panel" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/70">
    <div className="flex items-center gap-2 text-xs font-bold"><Layers3 size={15}/> Camadas temáticas sobre o DEM ({layers.length})</div>
    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
      Sobreponha NDVI, NDWI, uso/cobertura do solo ou imagens RGB sem modificar o DEM científico.
      Todos os dados são alinhados e recortados à extensão do modelo.
    </p>
    <label className="block text-[11px] font-semibold">Renderizador
      <select value={renderer} aria-label="Renderizador de raster no Terrain Studio"
        onChange={e=>setRenderer(e.target.value as typeof renderer)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
        <option value="auto">Automático</option>
        <option value="continuous">Contínuo · NDVI/NDWI/índices</option>
        <option value="classified">Classes · uso do solo/geologia/solos</option>
        <option value="rgb">Imagem RGB</option>
      </select>
    </label>
    {(renderer==="auto"||renderer==="continuous")&&<label className="block text-[11px] font-semibold">
      Paleta contínua
      <select value={palette} aria-label="Paleta de índice" onChange={e=>setPalette(e.target.value as typeof palette)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
        <option value="ndvi">NDVI · verde</option><option value="ndwi">NDWI · azul</option>
        <option value="terrain">Hipsometria</option>
      </select>
    </label>}
    <input type="file" accept=".tif,.tiff,image/tiff" ref={input} className="sr-only"
      aria-label="Importar GeoTIFF para a superfície 3D"
      onChange={e=>void loadRaster(e.target.files?.[0])}/>
    <button type="button" disabled={!terrain||busy} onClick={()=>input.current?.click()}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
      {busy?<Loader2 size={14} className="animate-spin"/>:<FileUp size={14}/>}
      Adicionar GeoTIFF temático
    </button>
    {busy&&<div className="flex items-center justify-between gap-2 text-xs" role="status">
      A preparar textura 3D {progress!==null?`${progress}%`:"…"}
      <button type="button" onClick={cancel} aria-label="Cancelar composição"><XCircle size={16}/></button>
    </div>}
    <details className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
      <summary className="cursor-pointer font-semibold">Mapa-base como textura · XYZ licenciado</summary>
      <p className="my-2 text-[11px] text-slate-600 dark:text-slate-300">
        O mapa-base visual Esri/OSM continua no fundo. Para projectar tiles na malha, utilize
        apenas uma origem XYZ própria ou contratada que permita esta utilização e CORS.
        Máximo de 16 tiles por pedido.
      </p>
      <label className="block text-xs">URL XYZ HTTPS
        <input type="url" value={xyz} onChange={e=>setXyz(e.target.value)}
          aria-label="URL de XYZ licenciado" placeholder="https://exemplo/{z}/{x}/{y}.png"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"/>
      </label>
      <label className="mt-2 block text-xs">Atribuição
        <input value={attribution} onChange={e=>setAttribution(e.target.value)}
          aria-label="Atribuição do mapa-base" placeholder="© Fornecedor"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"/>
      </label>
      <label className="my-2 flex items-start gap-2 text-[11px]">
        <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>
        Confirmo que a licença permite compor estes mosaicos no modelo 3D.
      </label>
      <button type="button" onClick={()=>void addXYZ()}
        disabled={!terrain||busy||!rights||!xyz.trim()||!attribution.trim()}
        className="w-full rounded-lg border border-sky-400 px-2 py-2 font-semibold text-sky-700 disabled:opacity-40 dark:text-sky-300">
        Aplicar mapa-base ao DEM
      </button>
      <p className="mt-2 text-[10px] text-slate-500">Não são guardadas chaves ou URLs. Atribuição permanece na legenda.</p>
    </details>
    {error&&<p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    {layers.length>0&&<div className="space-y-3">
      <strong className="text-xs">Pilha de texturas · de baixo para cima</strong>
      {layers.map((layer,index)=><div key={layer.id} data-testid="terrain-drape-layer"
        className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <div className="flex items-center gap-1">
          <button type="button" aria-label={"Alternar "+layer.name}
            onClick={()=>update(layer.id,{visible:!layer.visible})}>
            {layer.visible?<Eye size={15}/>:<EyeOff size={15}/>}
          </button>
          <strong title={layer.name} className="min-w-0 flex-1 truncate text-xs">{layer.name}</strong>
          <button type="button" title="Subir" aria-label={"Subir "+layer.name} disabled={index===layers.length-1}
            onClick={()=>onChange(reorderDrapes(layers,layer.id,"up"))}><ArrowUp size={14}/></button>
          <button type="button" title="Descer" aria-label={"Descer "+layer.name} disabled={index===0}
            onClick={()=>onChange(reorderDrapes(layers,layer.id,"down"))}><ArrowDown size={14}/></button>
          <button type="button" title="Remover" aria-label={"Remover "+layer.name}
            onClick={()=>onChange(layers.filter(item=>item.id!==layer.id))}><Trash2 size={14}/></button>
        </div>
        <small className="text-[10px] text-slate-600 dark:text-slate-300">
          {layer.kind==="continuous"?"Índice contínuo":layer.kind==="classified"?"Categorizado":layer.kind==="xyz"?"Mapa-base":"RGB"}
          {" · "}{Math.round(layer.coverage*100)}% de cobertura
          {layer.range&&` · ${layer.range.min.toFixed(3)}–${layer.range.max.toFixed(3)}`}
        </small>
        <label className="block text-xs">Opacidade · {Math.round(layer.opacity*100)}%
          <input type="range" min="0" max="100" step="5" disabled={!layer.visible}
            aria-label={"Opacidade de "+layer.name} value={Math.round(layer.opacity*100)}
            onChange={e=>update(layer.id,{opacity:Number(e.target.value)/100})}
            className="block w-full accent-sky-600"/>
        </label>
        <label className="block text-xs">Modo de mistura
          <select value={layer.blend} aria-label={"Mistura de "+layer.name}
            onChange={e=>update(layer.id,{blend:e.target.value as TerrainDrapeLayer["blend"]})}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
            <option value="normal">Normal</option><option value="multiply">Multiplicar</option>
            <option value="screen">Iluminar</option>
          </select>
        </label>
        {!!layer.categories?.length&&<details className="text-xs">
          <summary>Legenda · {layer.categories.length} classes</summary>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
            {layer.categories.map(c=><div key={c.value} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{background:c.color}}/>
              <span>{c.label} · {c.value}</span>
            </div>)}
          </div>
        </details>}
        {layer.attribution&&<small className="block text-[10px]">© {layer.attribution}</small>}
      </div>)}
    </div>}
  </section>;
}

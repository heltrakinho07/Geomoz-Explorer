import type {LayoutEditorProps} from '../layout/print-layout/state';
import {useLanguage} from '../../hooks/useLanguage';
import {geoMozSpecialistText} from './geomoz-specialist-locale';
export function GeoMozMapPlacement({layout,dispatch}:LayoutEditorProps){
 const {language}=useLanguage();const ui=(pt:string)=>geoMozSpecialistText(language,pt);
 const set=(patch:Partial<typeof layout>)=>dispatch({type:'setLayout',patch});
 return <section className="space-y-3" aria-label={ui('Posição do mapa e da legenda')}><h3 className="font-semibold">{ui('Mapa e legenda na página')}</h3>
 <label className="flex gap-2"><input type="checkbox" checked={!!layout.geomozMapFrame} onChange={e=>set({geomozMapFrame:e.target.checked?{x:5,y:15,width:70,height:75}:null})}/>{ui('Posição personalizada do mapa')}</label>
 {layout.geomozMapFrame&&<div className="grid grid-cols-2 gap-2">{(['x','y','width','height'] as const).map(key=>{const r=layout.geomozMapFrame!;const min=key==='x'||key==='y'?0:5,max=key==='x'?100-r.width:key==='y'?100-r.height:key==='width'?100-r.x:100-r.y;return <label key={key}>{({x:'X (%)',y:'Y (%)',width:ui('Largura (%)'),height:ui('Altura (%)')})[key]}<input className="w-full rounded border p-1" aria-label={ui('mapa')+' '+key} type="number" min={min} max={max} step={1} value={r[key]} onChange={e=>set({geomozMapFrame:{...r,[key]:Math.max(min,Math.min(max,Number(e.target.value)))}})}/></label>})}</div>}
 <label className="flex gap-2"><input type="checkbox" checked={!!layout.geomozLegendPlacement} onChange={e=>set({geomozLegendPlacement:e.target.checked?{x:77,y:15,scale:1}:null})}/>{ui('Posição personalizada da legenda')}</label>
 {layout.geomozLegendPlacement&&<div className="grid grid-cols-2 gap-2">{(['x','y','scale'] as const).map(key=>{const r=layout.geomozLegendPlacement!;return <label key={key}>{key==='scale'?ui('Tamanho relativo'):key.toUpperCase()+' (%)'}<input className="w-full rounded border p-1" aria-label={ui('legenda')+' '+key} type="number" min={key==='scale'?.5:0} max={key==='scale'?3:95} step={key==='scale'?.1:1} value={r[key]} onChange={e=>set({geomozLegendPlacement:{...r,[key]:Math.max(key==='scale'?.5:0,Math.min(key==='scale'?3:95,Number(e.target.value)))}})}/></label>})}</div>}
 <p className="text-xs text-muted-foreground">{ui('As posições usam a página como referência. A escala cartográfica acompanha o tamanho do mapa. Active «Legenda» para a apresentar; confirme que cabe na página antes de exportar.')}</p>
 </section>;
}

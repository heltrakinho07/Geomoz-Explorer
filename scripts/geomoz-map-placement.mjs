import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
export function prepareGeoMozMapPlacement(root){
 const app=resolve(root,'apps/geolibre-desktop/src'),core=resolve(root,'packages/core/src');
 const patch=(p,a,b)=>{const s=readFileSync(p,'utf8');if(s.split(a).length!==2)throw Error('Map placement source drift '+p);writeFileSync(p,s.replace(a,b));};
 const fields='  geomozMapFrame: {x:number;y:number;width:number;height:number}|null;\n  geomozLegendPlacement: {x:number;y:number;scale:number}|null;\n';
 patch(resolve(core,'print-layout-config.ts'),'export interface PrintLayoutConfig {','export interface PrintLayoutConfig {\n'+fields);
 patch(resolve(core,'print-layout-config.ts'),'export const DEFAULT_PRINT_LAYOUT: PrintLayoutConfig = {','export const DEFAULT_PRINT_LAYOUT: PrintLayoutConfig = {\n  geomozMapFrame:null, geomozLegendPlacement:null,');
 patch(resolve(core,'print-layout-config.ts'),'    geomozItems: normalizeLayoutItems(raw.geomozItems),',`    geomozItems: normalizeLayoutItems(raw.geomozItems),
    geomozMapFrame: normalizeGeoMozMapFrame(raw.geomozMapFrame),
    geomozLegendPlacement: normalizeGeoMozLegendPlacement(raw.geomozLegendPlacement),`);
 let p=resolve(core,'print-layout-config.ts');let s=readFileSync(p,'utf8');s='import {normalizeGeoMozMapFrame,normalizeGeoMozLegendPlacement} from "./geomoz-map-placement";\n'+s;writeFileSync(p,s);
 writeFileSync(resolve(core,'geomoz-map-placement.ts'),readFileSync(new URL('./assets/workbench/geomoz-map-placement.ts',import.meta.url)));
 p=resolve(app,'lib/print-layout.ts');patch(p,'export interface LayoutOptions {','export interface LayoutOptions {\n'+fields.replaceAll(': {','?: {'));
 patch(p,'  bodyTop = Math.min(bodyTop, bodyBottom - unit * 10);',`  if (opts.geomozMapFrame) {
    const f=opts.geomozMapFrame;
    return {unit,margin,bodyX:f.x*W/100,bodyY:f.y*H/100,bodyW:f.width*W/100,bodyH:f.height*H/100};
  }
  bodyTop = Math.min(bodyTop, bodyBottom - unit * 10);`);
 patch(p,'  if (opts.showLegend && opts.legend.length > 0) {',`  if (opts.showLegend && opts.legend.length > 0 && opts.geomozLegendPlacement) {
    const p=opts.geomozLegendPlacement, x=p.x*W/100, y=p.y*H/100;
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
    ctx.translate(x,y); ctx.scale(p.scale,p.scale);
    drawLegend(ctx,0,0,opts.legend,unit,{title:opts.legendTitle,groupByLayer:opts.legendGroupByLayer,markerIcons:opts.markerIcons,mapSymbolScale:Math.max(0,(opts.mapPixelRatio??1)*coverScale),maxHeight:(H-y)/p.scale,formatNote:opts.legendFormatNote});
    ctx.restore();
  } else if (opts.showLegend && opts.legend.length > 0) {`);
 p=resolve(app,'components/layout/print-layout/useLayoutOptions.ts');patch(p,'      geomozItems: layout.geomozItems,','      geomozItems: layout.geomozItems,\n      geomozMapFrame: layout.geomozMapFrame, geomozLegendPlacement: layout.geomozLegendPlacement,');patch(p,'      layout.geomozItems,','      layout.geomozItems, layout.geomozMapFrame, layout.geomozLegendPlacement,');
 writeFileSync(resolve(app,'components/geomoz/GeoMozMapPlacement.tsx'),readFileSync(new URL('./assets/workbench/GeoMozMapPlacement.tsx',import.meta.url)));
 p=resolve(app,'components/layout/PrintLayoutDialog.tsx');s=readFileSync(p,'utf8');writeFileSync(p,'import {GeoMozMapPlacement} from "../geomoz/GeoMozMapPlacement";\n'+s);patch(p,'            <PageEditor {...editorProps} />','            <PageEditor {...editorProps} />\n            <GeoMozMapPlacement {...editorProps} />');
}

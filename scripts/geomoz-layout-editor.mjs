import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
export function prepareGeoMozLayoutEditor(root){
 const app=resolve(root,'apps/geolibre-desktop/src');
 const patch=(p,a,b)=>{const s=readFileSync(p,'utf8');if(s.split(a).length!==2)throw Error('Layout editor source drift: '+p+' '+a.slice(0,45));writeFileSync(p,s.replace(a,b));};
 const copy=(name,p)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,readFileSync(new URL('./assets/workbench/'+name,import.meta.url)));};
 const core=resolve(root,'packages/core/src');
 copy('geomoz-layout-items.ts',resolve(core,'geomoz-layout-items.ts'));
 patch(resolve(core,'index.ts'),'export * from "./print-layout-config";','export * from "./print-layout-config";\nexport * from "./geomoz-layout-items";');
 const config=resolve(core,'print-layout-config.ts');
 patch(config,'import { removedLayerIdSet }','import {normalizeLayoutItems, type GeoMozLayoutItem} from "./geomoz-layout-items";\nimport { removedLayerIdSet }');
 patch(config,'export interface PrintLayoutConfig {','export interface PrintLayoutConfig {\n  geomozItems: GeoMozLayoutItem[];');
 patch(config,'export const DEFAULT_PRINT_LAYOUT: PrintLayoutConfig = {','export const DEFAULT_PRINT_LAYOUT: PrintLayoutConfig = {\n  geomozItems: [],');
 patch(config,'    title: str(raw.title, d.title),','    geomozItems: normalizeLayoutItems(raw.geomozItems),\n    title: str(raw.title, d.title),');
 copy('geomoz-layout-draw.ts',resolve(app,'lib/geomoz-layout-draw.ts'));
 copy('GeoMozLayoutItems.tsx',resolve(app,'components/geomoz/GeoMozLayoutItems.tsx'));
 const draw=resolve(app,'lib/print-layout.ts');
 patch(draw,'opts.attributionText ?? "Created with GeoLibre"','opts.attributionText ?? "Created with GeoMoz Explorer"');
 patch(draw,'if (attributionText) {\n      ctx.textAlign = "left";\n      ctx.fillText(attributionText, margin, baselineY, slotMax);','if (dateText) {\n      ctx.textAlign = "left";\n      ctx.fillText(dateText, margin, baselineY, slotMax);');
 patch(draw,'if (dateText) {\n      ctx.textAlign = "right";\n      ctx.fillText(dateText, W - margin, baselineY, slotMax);','if (attributionText) {\n      ctx.textAlign = "right";\n      ctx.fillText(attributionText, W - margin, baselineY, slotMax);');

 patch(draw,'export interface LayoutOptions {','export interface LayoutOptions {\n  geomozItems?: import("@geolibre/core").GeoMozLayoutItem[];');
 patch(draw,'export function drawLayoutContext(','import {drawGeoMozItems} from "./geomoz-layout-draw";\n\nexport function drawLayoutContext(');
 patch(draw,'/** Draw a north-pointing arrow rotated to account for map bearing. */','/** Draw a north-pointing arrow rotated to account for map bearing. */');
 // End of the shared renderer, before the next function.
 patch(draw,'  ctx.restore();\n}\n\n/** Draw a north-pointing arrow', '  drawGeoMozItems(ctx, W, H, opts.geomozItems, pageMm(resolvePageSize(opts)).widthMm);\n  ctx.restore();\n}\n\n/** Draw a north-pointing arrow');
 const options=resolve(app,'components/layout/print-layout/useLayoutOptions.ts');
 patch(options,'      title: resolvedTitle,','      geomozItems: layout.geomozItems,\n      title: resolvedTitle,');
 patch(options,'      resolvedTitle,','      layout.geomozItems,\n      resolvedTitle,');
 const preview=resolve(app,'components/layout/print-layout/usePreviewCanvas.ts');
 patch(preview,'import { useEffect, useRef }','import {prepareLayoutImages} from "../../../lib/geomoz-layout-draw";\nimport { useEffect, useRef }');
 patch(preview,'    raf = requestAnimationFrame(render);\n    return () => {','    let cancelled = false;\n    void prepareLayoutImages(displayOptions.geomozItems).then(() => {if(!cancelled)raf = requestAnimationFrame(render);}).catch(() => {if(!cancelled)raf = requestAnimationFrame(render);});\n    return () => {\n      cancelled = true;');
 const exp=resolve(app,'lib/print-layout-export.ts');
 let s=readFileSync(exp,'utf8');s='import {prepareLayoutImages} from "./geomoz-layout-draw";\n'+s;
 s=s.replaceAll('const canvas = renderToCanvas(opts, dpi);','await prepareLayoutImages(opts.geomozItems);\n  const canvas = renderToCanvas(opts, dpi);');
 s=s.replace('  const { renderLayoutSvg } = await import','  await prepareLayoutImages(opts.geomozItems);\n  const { renderLayoutSvg } = await import');writeFileSync(exp,s);
 const dialog=resolve(app,'components/layout/PrintLayoutDialog.tsx');
 s=readFileSync(dialog,'utf8');writeFileSync(dialog,'import {GeoMozLayoutItems} from "../geomoz/GeoMozLayoutItems";\n'+s);
 patch(dialog,'            <PageEditor {...editorProps} />','            <PageEditor {...editorProps} />\n            <GeoMozLayoutItems {...editorProps} canvasRef={previewRef} />');
}

import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function prepareGeoMozPrintQuality(root) {
 const app=resolve(root,'apps/geolibre-desktop/src');
 const patch=(file,needle,replacement)=>{
  const p=resolve(app,file),s=readFileSync(p,'utf8');
  if(s.split(needle).length!==2)throw Error('GeoMoz print anchor changed: '+file);
  writeFileSync(p,s.replace(needle,replacement));
 };
 writeFileSync(resolve(app,'lib/geomoz-print-resolution.ts'),readFileSync(new URL('./assets/workbench/geomoz-print-resolution.ts',import.meta.url)));
 patch('lib/print-layout-export.ts','  const surface = engine.getRenderSurface();',`  const map = engine.getMap();
  if (map && typeof map.setPixelRatio === "function" && typeof map.getPixelRatio === "function") {
    const { withPrintResolution } = await import("./geomoz-print-resolution");
    return withPrintResolution(map, () => captureEngineMapImageAtResolution(engine, clip, decorate));
  }
  return captureEngineMapImageAtResolution(engine, clip, decorate);
}

async function captureEngineMapImageAtResolution(
  engine: MapEngine,
  clip?: CaptureClip | null,
  decorate?: (context: CanvasRenderingContext2D, scale: number) => void,
): Promise<CapturedMap> {
  const surface = engine.getRenderSurface();`);
 patch('components/layout/print-layout/useExportActions.ts','import { useCallback, type Dispatch }','import { useCallback, useState, type Dispatch }');
 patch('components/layout/print-layout/useExportActions.ts','  const setError =','  const [exportDpi, setExportDpi] = useState(300);\n  const setError =');
 for(const [fn,ext] of [['exportLayoutPng','png'],['exportLayoutPdf','pdf']]) patch('components/layout/print-layout/useExportActions.ts',`${fn}(displayOptions, \`\${base}.${ext}\`)`,`${fn}(displayOptions, \`\${base}.${ext}\`, exportDpi)`);
 patch('components/layout/print-layout/useExportActions.ts','return { handleCopy, handleExport, handleAtlasExport, handleDialogOpenChange };','return { handleCopy, handleExport, handleAtlasExport, handleDialogOpenChange, exportDpi, setExportDpi };');
 patch('components/layout/print-layout/ExportActions.tsx','      {/* Atlas export progress',`      {!atlasEnabled && <label className="me-auto flex items-center gap-2 text-sm">Resolução de saída
        <select aria-label="Resolução de saída" disabled={exporting || atlasBusy} value={actions.exportDpi} onChange={e => actions.setExportDpi(Number(e.target.value))}>
          <option value={150}>150 DPI</option><option value={300}>300 DPI</option>
        </select>
      </label>}
      {/* Atlas export progress`);
 patch('components/layout/PrintLayoutDialog.tsx','            <PageEditor {...editorProps} />',`            <PageEditor {...editorProps} />
            <p className="text-xs text-muted-foreground" role="status">
              {captured ? \`Mapa: \${captured.width} × \${captured.height} píxeis.\` : "A preparar mapa para impressão…"}
              {" A resolução de saída não aumenta o detalhe dos dados raster. SVG preserva os elementos cartográficos; o mapa permanece uma imagem. PDF é rasterizado."}
            </p>`);
}

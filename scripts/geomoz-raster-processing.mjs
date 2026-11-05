import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

function once(source,from,to){
 if(source.split(from).length!==2)throw Error("GeoMoz raster processing source drift: "+from.slice(0,100));
 return source.replace(from,to);
}
export function prepareGeoMozRasterProcessing(root){
 const app=resolve(root,"apps/geolibre-desktop/src");
 writeFileSync(resolve(app,"lib/geomoz-raster-warp.ts"),readFileSync(new URL("./assets/workbench/geomoz-raster-warp.ts",import.meta.url),"utf8"));
 const path=resolve(app,"components/processing/RasterToolsDialog.tsx");
 let s=readFileSync(path,"utf8");
 s='import {warpRaster} from "../../lib/geomoz-raster-warp";\nimport {loadGdal} from "../../lib/gdal-loader";\n'+s;
 s=once(s,'  const groups = useMemo(groupedTools, []);','  const groups = useMemo(groupedTools, []);\n  const geomozWarp = tool.id === "reproject" || tool.id === "clip-mask";');
 s=s.replaceAll('tool.supportsClient','(tool.supportsClient || geomozWarp)');
 s=once(s,'  }, [open, tool, desktopServer]);','  }, [open, tool, desktopServer, geomozWarp]);');
 s=once(s,'      const { raster: result, bytes } = runRasterToolClient(tool.id, raster, params);',
 `      const mask = layers.find(layer => layer.id === params.mask_path)?.geojson;
      const warped = geomozWarp ? await warpRaster(await loadGdal(), tool.id, clientInput.bytes, params, mask) : null;
      const { raster: result, bytes } = warped
        ? {raster: await readRasterData(warped), bytes: warped}
        : runRasterToolClient(tool.id, raster, params);`);
 s=once(s,'const cogBytes = await convertRasterDataToCog(result);','const cogBytes = warped ? new Uint8Array(warped) : await convertRasterDataToCog(result);');
 s=once(s,'  }, [tool, params, clientInput, validateParams, mapControllerRef, t]);','  }, [tool, params, clientInput, validateParams, mapControllerRef, t, layers, geomozWarp]);');

 s=once(s,'            <div>\\n              <Button\\n                onClick={() => void handleRun()}',
 `            {engine === "client" && tool.id === "clip-mask" && (
              <fieldset className="grid gap-3 rounded-lg border p-3" aria-label="Parâmetros avançados do recorte">
                <legend className="px-1 font-medium">Parâmetros avançados do recorte</legend>
                <label className="grid gap-1">SRC de destino (opcional)
                  <input className="rounded border bg-background p-2" id="geomoz-mask-dst-crs" type="text" placeholder="EPSG:32736" value={String(params.dst_crs ?? "")} disabled={running} onChange={e=>setParam("dst_crs",e.target.value)}/>
                </label>
                <label className="grid gap-1">Reamostragem
                  <select className="rounded border bg-background p-2" id="geomoz-mask-resampling" value={String(params.resampling ?? "nearest")} disabled={running} onChange={e=>setParam("resampling",e.target.value)}>
                    <option value="nearest">Vizinho mais próximo (dados categóricos)</option>
                    <option value="bilinear">Bilinear (dados contínuos)</option>
                    <option value="cubic">Cúbica (dados contínuos)</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["x_resolution","y_resolution"] as const).map((axis)=><label key={axis} className="grid gap-1">{axis==="x_resolution"?"Resolução X":"Resolução Y"}
                    <input id={"geomoz-mask-"+axis} className="w-full rounded border bg-background p-2" type="number" min="0" step="any" value={params[axis]===undefined?"":String(params[axis])} disabled={running} onChange={e=>setParam(axis,e.target.value===""?undefined:Number(e.target.value))}/>
                  </label>)}
                </div>
                <label className="grid gap-1">Valor NoData de saída (opcional)
                  <input id="geomoz-mask-nodata" className="rounded border bg-background p-2" type="number" step="any" value={params.nodata===undefined?"":String(params.nodata)} disabled={running} onChange={e=>setParam("nodata",e.target.value===""?undefined:Number(e.target.value))}/>
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" id="geomoz-mask-alpha" checked={params.alpha!==false} disabled={running} onChange={e=>setParam("alpha",e.target.checked)}/> Criar banda de transparência (alpha)</label>
                <p className="text-xs text-muted-foreground">A resolução usa as unidades do SRC de destino. Para classes raster, use vizinho mais próximo.</p>
              </fieldset>
            )}
            <div>
              <Button
                onClick={() => void handleRun()}`);

 s=once(s,'              <RasterParameterField\n                key={param.id}',
 `              engine === "client" && tool.id === "clip-mask" && param.id === "mask_path" ?
              <div className="grid gap-1.5" key={param.id}>
                <Label htmlFor="mask_path">Camada poligonal de máscara</Label>
                <Select id="mask_path" value={String(params.mask_path ?? "")} onChange={e=>setParam("mask_path",e.target.value)} disabled={running}>
                  <option value="">Seleccione uma camada</option>
                  {layers.filter(layer=>layer.geojson?.features.length && layer.geojson.features.every(f=>f.geometry && ["Polygon","MultiPolygon"].includes(f.geometry.type))).map(layer=>
                    <option key={layer.id} value={layer.id}>{layer.name}</option>)}
                </Select>
              </div> :
              <RasterParameterField
                key={param.id}`);
 writeFileSync(path,s);
}

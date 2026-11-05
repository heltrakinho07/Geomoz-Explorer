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

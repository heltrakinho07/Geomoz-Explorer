#!/usr/bin/env node
/**
 * Compile GeoMoz-owned React chrome against a pinned MIT GIS engine.
 * Fail closed on source drift; never edit minified bundles or proxy DOM clicks.
 */
import { readFileSync,writeFileSync,mkdirSync,existsSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { brandUpstreamLocales } from "./geomoz-brand-locales.mjs";
import { patchGeoMozDigitizingEngine } from "./geomoz-digitizing-engine.mjs";
const root=resolve(process.argv[2]??".geolibre-upstream");
const app=resolve(root,"apps/geolibre-desktop/src");
const read=path=>readFileSync(resolve(app,path),"utf8");
const write=(path,content)=>{const target=resolve(app,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);};
function once(source,needle,replacement,label){
  if(source.split(needle).length!==2)throw Error("GeoMoz source integration anchor changed: "+label);
  return source.replace(needle,replacement);
}
if(!existsSync(resolve(root,"LICENSE")))throw Error("Expected the pinned GeoLibre checkout with its MIT license");
let toolbar=read("components/layout/TopToolbar.tsx");
if(toolbar.includes("GeoMozWorkbenchChrome"))throw Error("GeoMoz interface is already prepared; use a clean pinned checkout");
toolbar='import { GeoMozWorkbenchChrome, GeoMozMenuSlot } from "../geomoz/GeoMozWorkbenchChrome";\n'+toolbar;
const start=toolbar.indexOf("    <header\n");
const logoEnd=toolbar.indexOf("      {!viewer && isMenuVisible(uiProfile, \"project\")",start);
const tail=toolbar.indexOf('      <div className="ms-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">',logoEnd);
const end=toolbar.indexOf("    </header>",tail);
if(start<0||logoEnd<start||tail<logoEnd||end<tail)throw Error("GeoMoz toolbar source anchors changed");
let children=toolbar.slice(logoEnd,tail);
const menuAreas={ProjectMenu:"project",EditMenu:"map",ViewMenu:"map",AddDataMenu:"data",ProcessingMenu:"analysis",ControlsMenu:"map",PluginsMenu:"settings",PluginToolbarMenus:"settings",SettingsDialog:"settings",HelpMenu:"settings"};
for(const [tag,area] of Object.entries(menuAreas)){
  const pattern=new RegExp("<"+tag+"\\b[\\s\\S]*?\\/>","g");
  let count=0;
  children=children.replace(pattern,jsx=>{count++;return '<GeoMozMenuSlot area="'+area+'">'+jsx+'</GeoMozMenuSlot>';});
  if(!count)throw Error("Missing engine menu: "+tag);
}
toolbar=toolbar.slice(0,start)+`    <GeoMozWorkbenchChrome commands={paletteCommands.commands} themeMode={themeMode}
      onToggleThemeMode={onToggleThemeMode} onSearch={() => dialogs.setCommandPaletteOpen(true)} viewer={viewer} mapControllerRef={mapControllerRef}>
`+children+"    </GeoMozWorkbenchChrome>"+toolbar.slice(end+"    </header>".length);
// Drop symbols that belonged exclusively to the replaced visual chrome.
toolbar=toolbar.replace('  DEFAULT_PROJECT_NAME,\n','').replace('import { Button, cn, Input } from "@geolibre/ui";','import { cn } from "@geolibre/ui";').replace('import { Map, Moon, Sun } from "lucide-react";','');
toolbar=toolbar.replace('  const projectNameComposingRef = useRef(false);\n','');
write("components/layout/TopToolbar.tsx",toolbar);

// GeoMoz: preserve the pinned georeferencer and extend the real GCP/GDAL workflow
// at TypeScript source level (no HTML or minified-bundle replacements).
write("lib/geomoz-georeference.ts",readFileSync(new URL("./assets/workbench/geomoz-georeference.ts",import.meta.url),"utf8"));
for (const [path, edits] of Object.entries({"components/layout/GeoreferencerDialog.tsx":[["import { releaseBodyPointerEvents } from \"../../lib/radix-compat\";","import { releaseBodyPointerEvents } from \"../../lib/radix-compat\";\nimport { geomozProjectedToGeographic, geomozGcpPixelResiduals, geomozValidateGeoreferencing, type GeoMozGeorefCrs } from \"../../lib/geomoz-georeference\";"],["  const [transform, setTransform] = useState<GeoTransform>(\"affine\");","  const [transform, setTransform] = useState<GeoTransform>(\"affine\");\n  const [coordinateCrs, setCoordinateCrs] = useState<GeoMozGeorefCrs>(\"EPSG:4326\");\n  const [outputCrs, setOutputCrs] = useState<GeoMozGeorefCrs>(\"EPSG:4326\");\n  const [outputResampling, setOutputResampling] = useState<\"near\" | \"bilinear\" | \"cubic\">(\"bilinear\");\n  const [manualX, setManualX] = useState(\"\");\n  const [manualY, setManualY] = useState(\"\");"],["  const affine = useMemo(() => solveAffine(gcps), [gcps]);","  const affine = useMemo(() => solveAffine(gcps), [gcps]);\n  const geomozPixelResiduals = useMemo(() => affine ? geomozGcpPixelResiduals(affine, gcps) : null, [affine, gcps]);\n  const geomozGcpValidation = useMemo(() => image ? geomozValidateGeoreferencing(gcps, image.width, image.height, transform, geomozPixelResiduals?.rms ?? null) : null, [image, gcps, transform, geomozPixelResiduals]);\n\n  const handleGeoMozManualGcp = () => {\n    if (!pendingPixel) return;\n    if (!manualX.trim() || !manualY.trim()) {\n      setNotice({ msg: \"Preencha X e Y para adicionar o ponto.\", kind: \"error\" });\n      return;\n    }\n    try {\n      const [lng, lat] = geomozProjectedToGeographic(Number(manualX), Number(manualY), coordinateCrs);\n      const key = (gcpKeyRef.current += 1);\n      setGcps(gs => [...gs, { px: pendingPixel.px, py: pendingPixel.py, lng, lat, key }]);\n      setPendingPixel(null);\n      setManualX(\"\"); setManualY(\"\");\n      setNotice(null);\n    } catch (error) {\n      setNotice({ msg: error instanceof Error ? error.message : \"Coordenadas inválidas.\", kind: \"error\" });\n    }\n  };\n"],["                  </Button>\n                </div>\n\n                {/* GCP table */}","                  </Button>\n                </div>\n\n                {/* GeoMoz: GCP manual no SRC escolhido (equivalente ao QGIS). */}\n                <div className=\"grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-4\">\n                  <label className=\"space-y-1 text-xs\">\n                    <span className=\"font-semibold\">SRC dos GCPs</span>\n                    <Select aria-label=\"SRC das coordenadas manuais\" value={coordinateCrs}\n                      onChange={e => setCoordinateCrs(e.target.value as GeoMozGeorefCrs)} className=\"w-full\">\n                      <option value=\"EPSG:4326\">WGS 84 · Longitude / Latitude</option>\n                        <option value=\"EPSG:3857\">Web Mercator (m)</option>\n                        <option value=\"EPSG:32735\">WGS 84 / UTM 35S (m)</option>\n                        <option value=\"EPSG:32736\">WGS 84 / UTM 36S (m)</option>\n                        <option value=\"EPSG:32737\">WGS 84 / UTM 37S (m)</option>\n                    </Select>\n                  </label>\n                  <label className=\"space-y-1 text-xs\">\n                    <span className=\"font-semibold\">X · Este / Longitude</span>\n                    <input aria-label=\"Coordenada X do GCP\" className=\"w-full rounded-md border bg-background p-2\"\n                      type=\"number\" step=\"any\" value={manualX} onChange={e => setManualX(e.target.value)} />\n                  </label>\n                  <label className=\"space-y-1 text-xs\">\n                    <span className=\"font-semibold\">Y · Norte / Latitude</span>\n                    <input aria-label=\"Coordenada Y do GCP\" className=\"w-full rounded-md border bg-background p-2\"\n                      type=\"number\" step=\"any\" value={manualY} onChange={e => setManualY(e.target.value)} />\n                  </label>\n                  <div className=\"flex items-end\">\n                    <Button type=\"button\" className=\"w-full\" disabled={!pendingPixel || !manualX.trim() || !manualY.trim()}\n                      onClick={handleGeoMozManualGcp}>Adicionar GCP manual</Button>\n                  </div>\n                  <p className=\"text-xs text-muted-foreground sm:col-span-4\">Também pode clicar em «Associar no mapa». As coordenadas UTM são convertidas para WGS 84 para alinhar o raster com as camadas do mapa.</p>\n                  {geomozGcpValidation?.warning && (\n                    <p role=\"status\" className=\"text-xs text-amber-700 dark:text-amber-300 sm:col-span-4\">{geomozGcpValidation.warning}</p>\n                  )}\n                </div>\n\n                {/* GCP table */}"],["{t(\"georeferencer.rms\", {\n                            rms: residuals.rms.toFixed(1),\n                          })}","{\"RMSE: \" + (geomozPixelResiduals?.rms.toFixed(2) ?? \"—\") + \" px\"}"],["{residuals ? `${residuals.perPoint[i].toFixed(1)} m` : \"—\"}","{geomozPixelResiduals ? geomozPixelResiduals.perPoint[i].toFixed(2) + \" px\" : \"—\"}"],["<Label htmlFor=\"georef-transform\">{t(\"georeferencer.exportTiff\")}</Label>","<Label htmlFor=\"georef-transform\">{t(\"georeferencer.exportTiff\")}</Label>\n\n                  <div className=\"grid grid-cols-1 gap-2 sm:grid-cols-2\">\n                    <label className=\"space-y-1 text-xs\">\n                      <span className=\"font-semibold\">SRC de saída (GeoTIFF)</span>\n                      <Select aria-label=\"SRC de saída do GeoTIFF\" className=\"w-full\" value={outputCrs}\n                        disabled={exporting} onChange={e => setOutputCrs(e.target.value as GeoMozGeorefCrs)}>\n                        <option value=\"EPSG:4326\">WGS 84 · Longitude / Latitude</option>\n                        <option value=\"EPSG:3857\">Web Mercator (m)</option>\n                        <option value=\"EPSG:32735\">WGS 84 / UTM 35S (m)</option>\n                        <option value=\"EPSG:32736\">WGS 84 / UTM 36S (m)</option>\n                        <option value=\"EPSG:32737\">WGS 84 / UTM 37S (m)</option>\n                      </Select>\n                    </label>\n                    <label className=\"space-y-1 text-xs\">\n                      <span className=\"font-semibold\">Reamostragem</span>\n                      <Select aria-label=\"Método de reamostragem\" className=\"w-full\" value={outputResampling}\n                        disabled={exporting} onChange={e => setOutputResampling(e.target.value as \"near\" | \"bilinear\" | \"cubic\")}>\n                        <option value=\"near\">Vizinho mais próximo</option>\n                        <option value=\"bilinear\">Bilinear</option>\n                        <option value=\"cubic\">Cúbica</option>\n                      </Select>\n                    </label>\n                  </div>\n"],["exportGeoTiff(image.url, image.name || \"georeferenced\", gcps, transform)","exportGeoTiff(image.url, image.name || \"georeferenced\", gcps, transform, outputCrs, outputResampling)"],["[affine, image, exporting, gcps, transform, t]","[affine, image, exporting, gcps, transform, outputCrs, outputResampling, t]"]],"lib/georeference-gdal.ts":[["  transform: GeoTransform,\n): Promise<Uint8Array>","  transform: GeoTransform,\n  targetCrs = \"EPSG:4326\",\n  resampling: \"near\" | \"bilinear\" | \"cubic\" = \"bilinear\",\n): Promise<Uint8Array>"],["warpArgsForTransform(transform)","warpArgsForTransform(transform, targetCrs, resampling)"]],"lib/georeference.ts":[["export function warpArgsForTransform(transform: GeoTransform): string[] {","export function warpArgsForTransform(transform: GeoTransform, targetCrs = \"EPSG:4326\", resampling: \"near\" | \"bilinear\" | \"cubic\" = \"bilinear\"): string[] {"],["return [...method, \"-t_srs\", \"EPSG:4326\", \"-r\", \"bilinear\", \"-of\", \"COG\"];","return [...method, \"-t_srs\", targetCrs, \"-r\", resampling, \"-of\", \"COG\"];"]]})) {
  let source=read(path);
  for (const [from,to] of edits) {
    source=once(source,from,to,"GeoMoz georeferencer "+path);
  }
  write(path,source);
}

// Ensure out-of-bounds pixels are transparent when a scanned, rotated map
// is warped into a north-up GeoTIFF for the native raster layer.
let georefGdal=read("lib/georeference-gdal.ts");
georefGdal=once(georefGdal,
  '  resampling: "near" | "bilinear" | "cubic" = "bilinear",\n): Promise<Uint8Array>',
  '  resampling: "near" | "bilinear" | "cubic" = "bilinear",\n  transparent = false,\n): Promise<Uint8Array>',
  "GDAL warp transparent background option");
georefGdal=once(georefGdal,
  '    const warped = await Gdal.gdalwarp(gcpDs, warpArgsForTransform(transform, targetCrs, resampling), "georeferenced.tif");',
  '    const warpArgs = warpArgsForTransform(transform, targetCrs, resampling);\n    if (transparent) warpArgs.splice(warpArgs.length - 2, 0, "-dstalpha");\n    const warped = await Gdal.gdalwarp(gcpDs, warpArgs, "georeferenced.tif");',
  "GDAL destination alpha instead of opaque black corners");
write("lib/georeference-gdal.ts",georefGdal);

// "Adicionar ao mapa" needs a genuinely rectified, north-up COG. The pinned
// engine's original button only pins the source scan by four affine corners,
// even when the user selected polynomial or TPS for a warp.
let georeferencer=read("components/layout/GeoreferencerDialog.tsx");
georeferencer=once(georeferencer,
  'import { releaseBodyPointerEvents } from "../../lib/radix-compat";',
  'import { releaseBodyPointerEvents } from "../../lib/radix-compat";\nimport { addRasterToMap } from "@geolibre/plugins";\nimport { createAppAPI } from "../../hooks/usePlugins";',
  "use production raster pipeline");
georeferencer=once(georeferencer,
  'import {\n  DEFAULT_LAYER_STYLE,\n  type GeoLibreLayer,\n  shouldZoomToNewLayers,\n  useAppStore,\n} from "@geolibre/core";\n',
  "",
  "drop corner-pinned image import");
georeferencer=once(georeferencer,'  cornersInRange,\n  cornersToBounds,\n',"","drop affine corners");
georeferencer=once(georeferencer,'  imageCornersToMap,\n',"","drop corner mapping");
georeferencer=once(georeferencer,'  const addLayer = useAppStore((s) => s.addLayer);\n',"","remove unused image store action");
const idStart=georeferencer.indexOf("function createId(): string {");
const idEnd=georeferencer.indexOf("/** A GCP plus a stable React key",idStart);
if(idStart<0 || idEnd<idStart || !georeferencer.slice(idStart,idEnd).includes("randomUUID")) {
  throw Error("GeoMoz georeferencer source changed: image overlay createId");
}
georeferencer=georeferencer.slice(0,idStart)+georeferencer.slice(idEnd);
const applyStart=georeferencer.indexOf("  const handleApply = useCallback(() => {");
const applyEnd=georeferencer.indexOf("\n  const removeGcp =",applyStart);
if(applyStart<0 || applyEnd<applyStart || !georeferencer.slice(applyStart,applyEnd).includes('type: "image"') ||
  !georeferencer.slice(applyStart,applyEnd).includes("imageCornersToMap")) {
  throw Error("GeoMoz georeferencer source changed: affine-only image overlay");
}
const rasterApply=[
'  const handleApply = useCallback(async () => {',
'    if (!affine || !image || exporting) return;',
'    const validity = geomozValidateGeoreferencing(',
'      gcps, image.width, image.height, transform, geomozPixelResiduals?.rms ?? null,',
'    );',
'    if (!validity.ok) {',
'      setNotice({ msg: validity.message, kind: "error" });',
'      return;',
'    }',
'    setExporting(true);',
'    setNotice({ msg: "A rectificar o raster com GDAL e a adicionar o GeoTIFF ao mapa…", kind: "info" });',
'    try {',
'      // Never pin the raw scan to four corners: run the selected GDAL warp.',
'      // Map layers use EPSG:4326; the user-selected output CRS is for export.',
'      const bytes = await exportGeoTiff(',
'        image.url, image.name || "carta-rectificada", gcps, transform,',
'        "EPSG:4326", outputResampling, true,',
'      );',
'      if (!bytes.byteLength) throw new Error("O GDAL gerou um raster vazio.");',
'      const name = (image.name || "Carta") + " · rectificada";',
'      const cog = new File([bytes as BlobPart], name + ".tif", { type: "image/tiff" });',
'      await addRasterToMap(createAppAPI(mapControllerRef), cog, {',
'        name, zoomTo: true, state: { opacity },',
'      });',
'      setNotice(null);',
'      onOpenChange(false);',
'    } catch (error) {',
'      console.error("GeoMoz: falha ao rectificar e carregar a carta", error);',
'      setNotice({',
'        msg: "Não foi possível rectificar e adicionar o GeoTIFF. " +',
'          (error instanceof Error ? error.message : "Verifique os GCPs e a ligação ao motor GDAL."),',
'        kind: "error",',
'      });',
'    } finally {',
'      setExporting(false);',
'    }',
'  }, [affine, image, exporting, gcps, transform, outputResampling, geomozPixelResiduals, opacity, mapControllerRef, onOpenChange]);',
''].join("\n");
georeferencer=georeferencer.slice(0,applyStart)+rasterApply+georeferencer.slice(applyEnd);
georeferencer=once(georeferencer,
  '<Button onClick={handleApply} disabled={!affine || !image}>',
  '<Button onClick={handleApply} disabled={!affine || !image || exporting}>',
  "disable map addition during GDAL");
georeferencer=once(georeferencer,
  '{t("georeferencer.addToMap")}',
  '{exporting ? "A processar raster…" : t("georeferencer.addToMap")}',
  "show raster processing");
georeferencer=once(georeferencer,
  '                  <p className="text-xs text-muted-foreground sm:col-span-4">Também pode clicar em «Associar no mapa». As coordenadas UTM são convertidas para WGS 84 para alinhar o raster com as camadas do mapa.</p>',
  '                  <p className="text-xs text-muted-foreground sm:col-span-4">Também pode clicar em «Associar no mapa». As coordenadas UTM são convertidas para WGS 84. Distribua pelo menos quatro GCPs, preferencialmente perto dos quatro cantos da carta, e confira o RMS.</p>',
  "georeferencing guidance");
georeferencer=once(georeferencer,
  '{"RMSE: " + (geomozPixelResiduals?.rms.toFixed(2) ?? "—") + " px"}',
  '{"RMSE afim (referência): " + (geomozPixelResiduals?.rms.toFixed(2) ?? "—") + " px"}',
  "label preliminary affine fit RMS");
georeferencer=once(georeferencer,
  '                  <p className="text-xs text-muted-foreground">\n                    {affine && gcps.length < minGcpsForTransform(transform)',
  '                  <p className="text-xs text-muted-foreground">«Adicionar ao mapa» rectifica com o método escolhido e cria um GeoTIFF WGS 84. O SRC de saída acima é usado apenas no ficheiro descarregado. A precisão depende dos GCPs.</p>\n                  <p className="text-xs text-muted-foreground">\n                    {affine && gcps.length < minGcpsForTransform(transform)',
  "explain the two output destinations");
write("components/layout/GeoreferencerDialog.tsx",georeferencer);

let shell=read("components/layout/DesktopShell.tsx");
shell=once(shell,'import { LayerPanel } from "../panels/LayerPanel";','import { GeoMozLayerPanel as LayerPanel } from "../geomoz/GeoMozLayerPanel";',"layer navigator");
shell=once(shell,'className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background"','className="gm-workbench relative flex h-full min-w-0 flex-col overflow-hidden bg-background"',"workspace root");
shell=once(shell,'<h1 className="sr-only">{t("shell.workspaceTitle")}</h1>','<h1 className="sr-only">GeoMoz GIS Workspace — mapa e análise</h1>',"workspace name");
shell=once(shell,'builtinTitle={t("sharedRail.layers")}','builtinTitle="Catálogo"',"catalog rail title");
shell=once(shell,'builtinTitle={t("sharedRail.style")}','builtinTitle="Simbologia"',"style rail title");
write("components/layout/DesktopShell.tsx",shell);
let rail=read("components/panels/SharedSidebar.tsx");
rail=once(rail,'"flex w-full shrink-0 items-center gap-1 border-t bg-card','"gm-shared-rail flex w-full shrink-0 items-center gap-1 border-t bg-card',"GeoMoz activity rail");
write("components/panels/SharedSidebar.tsx",rail);
for(const name of ["GeoMozWorkbenchChrome.tsx","GeoMozToolCatalog.tsx","GeoMozLayerPanel.tsx","GeoMozLayerProperties.tsx","GeoMozSeismicPanel.tsx","GeoMozSeismicAnalysis.tsx","GeoMozEarthscopeStations.tsx","seismic-data.ts","seismic-analytics.ts","earthscope-stations.ts","GeoMozLayerCreation.tsx","GeoMozDigitizingTools.tsx","geomoz-cartography.ts"]){
  write("components/geomoz/"+name,readFileSync(new URL("./assets/workbench/"+name,import.meta.url),"utf8"));
}
write("hooks/useThemeMode.ts",readFileSync(new URL("./assets/workbench/useThemeMode.ts",import.meta.url),"utf8"));
// Portuguese is the GeoMoz default; explicit saved engine-language settings still win.
let i18n=read("i18n/index.ts");
const languageStart=i18n.indexOf("    const navigatorLanguages =");
const languageEnd=i18n.indexOf("\n  }\n\n  return DEFAULT_LANGUAGE;",languageStart);
if(languageStart<0||languageEnd<languageStart)throw Error("GeoMoz initial-language anchors changed");
i18n=i18n.slice(0,languageStart)+'    return "pt";'+i18n.slice(languageEnd);
write("i18n/index.ts",i18n);
// Product curation intersects the existing capability, role and profile gates.
// The source registries and callbacks are retained for gradual adaptation.
write("lib/geomoz-workbench-profile.ts",readFileSync(new URL("./assets/workbench/geomoz-workbench-profile.ts",import.meta.url),"utf8"));
write("lib/geomoz-command-context.ts",readFileSync(new URL("./assets/workbench/geomoz-command-context.ts",import.meta.url),"utf8"));
let commands=read("hooks/toolbar/useToolbarCommands.ts");
commands='import { curateGeoMozCommands } from "../../lib/geomoz-workbench-profile";\nimport { preserveCommandApi } from "../../lib/geomoz-command-context";\n'+commands;
commands=once(commands,"  const shortcutCommands = useMemo(","  const curatedCommands = useMemo(() => curateGeoMozCommands(allowedCommands), [allowedCommands]);\n  const shortcutCommands = useMemo(","curated shortcut registry");
commands=commands.replace("? allowedCommands.filter", "? curatedCommands.filter").replace(": allowedCommands,", ": curatedCommands,").replace("[allowedCommands, viewer]", "[curatedCommands, viewer]").replace("return allowedCommands;", "return curatedCommands;");
commands=once(commands,"        createLatestProxy(() => buildingContext ?? latestContextRef.current),","        preserveCommandApi(createLatestProxy(() => buildingContext ?? latestContextRef.current), () => buildingContext ?? latestContextRef.current),","preserve enumerable map API for plugin lifecycle");
commands=once(commands,"const { t, themeMode, shareAvailable, plugins, isActive } = options;","const { t, themeMode, shareAvailable, plugins, isActive, appApi } = options;","map API memo identity");
commands=once(commands,"      pluginKey,\n    ],","      pluginKey,\n      appApi,\n    ],","rebuild commands when map API changes");
write("hooks/toolbar/useToolbarCommands.ts",commands);
let palette=read("hooks/toolbar/usePaletteCommands.ts");
palette='import { curateGeoMozCommands } from "../../lib/geomoz-workbench-profile";\n'+palette;
palette=once(palette,"filterCommandsByCapabilities(allTools, deploymentCapabilities)","curateGeoMozCommands(filterCommandsByCapabilities(allTools, deploymentCapabilities))","curated dynamic catalog");
write("hooks/toolbar/usePaletteCommands.ts",palette);
let profile=read("lib/ui-profile.ts");
profile='import { isGeoMozDataSourceVisible, isGeoMozPluginVisible, isGeoMozMenuItemVisible } from "./geomoz-workbench-profile";\n'+profile;
for(const [fn,param,gate] of [
  ["isDataSourceVisible","id","isGeoMozDataSourceVisible"],
  ["isPluginVisible","id","isGeoMozPluginVisible"],
  ["isMenuItemVisible","itemId","isGeoMozMenuItemVisible"],
]){
  const anchor='export function '+fn+'(profile: UiProfileSettings, '+param+': string): boolean {';
  profile=once(profile,anchor,anchor+'\n  if (!'+gate+'('+param+')) return false;',"product gate "+fn);
}
write("lib/ui-profile.ts",profile);
for(const [file,family,registry] of [["VectorToolsDialog","vector","VECTOR_TOOLS"],["RasterToolsDialog","raster","RASTER_TOOLS"]]){
  const path="components/processing/"+file+".tsx";
  let dialog=read(path);
  dialog='import { isGeoMozToolVisible } from "../../lib/geomoz-workbench-profile";\n'+dialog;
  dialog=once(dialog,"for (const tool of "+registry+") {","for (const tool of "+registry+") {\n    if (!isGeoMozToolVisible(\""+family+"\", tool.id)) continue;","curated "+family+" tool list");
  write(path,dialog);
}
let context=read("components/layout/MapContextMenu.tsx");
context='import { GEOMOZ_ROLLOUT } from "../../lib/geomoz-workbench-profile";\n'+context;
context=context.replaceAll("{lineOfSightAvailable ? (","{GEOMOZ_ROLLOUT.immersive && lineOfSightAvailable ? (").replace("{onExplorePlace ? (","{GEOMOZ_ROLLOUT.immersive && onExplorePlace ? (");
context=once(context,"          <DropdownMenuSub>","          {GEOMOZ_ROLLOUT.specialistProcessing && <DropdownMenuSub>","advanced context tools");
context=once(context,"          </DropdownMenuSub>","          </DropdownMenuSub>}","advanced context tools end");
context=once(context,'          <DropdownMenuItem onSelect={viewInGoogleMaps}', '          {GEOMOZ_ROLLOUT.immersive && <DropdownMenuItem onSelect={viewInGoogleMaps}',"external map links");
context=once(context,'{t("mapContextMenu.viewInGoogleEarth")}\n          </DropdownMenuItem>', '{t("mapContextMenu.viewInGoogleEarth")}\n          </DropdownMenuItem>}','external map links end');
// Each external link needs its own conditional expression.
context=context.replace('{t("mapContextMenu.viewInGoogleMaps")}\n          </DropdownMenuItem>', '{t("mapContextMenu.viewInGoogleMaps")}\n          </DropdownMenuItem>}').replace('<DropdownMenuItem onSelect={viewInGoogleEarth}', '{GEOMOZ_ROLLOUT.immersive && <DropdownMenuItem onSelect={viewInGoogleEarth}');
write("components/layout/MapContextMenu.tsx",context);
let browser=read("hooks/useRegisterBrowserPanel.ts");
browser='import { GEOMOZ_ROLLOUT } from "../lib/geomoz-workbench-profile";\n'+browser;
browser=once(browser,"() =>\n      registerPersistedRightPanel(","() =>\n      GEOMOZ_ROLLOUT.fullMenus ? registerPersistedRightPanel(","retain generic browser registration");
browser=once(browser,'        "browserPanelVisible",\n      ),','        "browserPanelVisible",\n      ) : undefined,',"hide generic browser rail");
write("hooks/useRegisterBrowserPanel.ts",browser);
let startup=read("hooks/desktop-shell/useStartupPanels.ts");
startup='import { GEOMOZ_ROLLOUT } from "../../lib/geomoz-workbench-profile";\n'+startup;
startup=once(startup,"if (handled.current || viewer ||","if (!GEOMOZ_ROLLOUT.advancedData || handled.current || viewer ||","hide advanced startup browser");
write("hooks/desktop-shell/useStartupPanels.ts",startup);
let history=read("components/processing/ProcessingHistoryDialog.tsx");
history='import { GEOMOZ_ROLLOUT, isGeoMozCommandVisible } from "../../lib/geomoz-workbench-profile";\n'+history;
history=once(history,'{AUTO_RERUN_KINDS.has(run.kind) ? (','{isGeoMozCommandVisible("proc."+run.kind+"."+run.toolId) && AUTO_RERUN_KINDS.has(run.kind) ? (',"curated history rerun");
history=once(history,'{EDIT_RERUN_KINDS.has(run.kind) ? (','{isGeoMozCommandVisible("proc."+run.kind+"."+run.toolId) && EDIT_RERUN_KINDS.has(run.kind) ? (',"curated history edit");
history=once(history,'{PYTHON_ELIGIBLE_KINDS.has(run.kind) &&','{GEOMOZ_ROLLOUT.specialistProcessing && PYTHON_ELIGIBLE_KINDS.has(run.kind) &&',"retain hidden Python export");
write("components/processing/ProcessingHistoryDialog.tsx",history);
// Keep the editor implementation and every mode; offer only study-area drawing.
writeFileSync(resolve(root,"packages/plugins/src/geomoz-workbench-profile.ts"),readFileSync(new URL("./assets/workbench/geomoz-workbench-profile.ts",import.meta.url),"utf8"));
const editorPath=resolve(root,"packages/plugins/src/plugins/maplibre-geo-editor.ts");
let editor=readFileSync(editorPath,"utf8");
editor='import { GEOMOZ_ROLLOUT } from "../geomoz-workbench-profile";\n'+editor;
editor=once(editor,"    ...GEO_EDITOR_OPTIONS,","    ...GEO_EDITOR_OPTIONS,\n    ...(!GEOMOZ_ROLLOUT.advancedDrawing ? {\n      drawModes: GEO_EDITOR_OPTIONS.drawModes.filter(mode => [\"polygon\",\"line\",\"rectangle\",\"marker\"].includes(mode)),\n      editModes: GEO_EDITOR_OPTIONS.editModes.filter(mode => [\"select\",\"drag\",\"change\",\"delete\"].includes(mode)),\n      showFeatureProperties: false,\n      enableAttributeEditing: false,\n    } : { drawModes: GEO_EDITOR_OPTIONS.drawModes.filter(mode => mode !== \"massing\") }),","curated study-area editor");
editor=once(editor,"if (isGeometryEditSession) geoEditorControl?.closeAttributeEditor();","if (isGeometryEditSession || !GEOMOZ_ROLLOUT.advancedDrawing) geoEditorControl?.closeAttributeEditor();","hide massing attribute form");
editor=patchGeoMozDigitizingEngine(editor);
writeFileSync(editorPath,editor);
// A new deployed worker may emit several controllerchange / update events in
// quick succession. Upstream deduplication increments a visible "×2" counter
// instead of suppressing a duplicate notice. Keep one actionable prompt per
// open GeoMoz GIS Workspace tab; NEVER auto-reload unsaved edits.
let entry=read("main.tsx");
entry=once(entry,
  "async function offerReloadIfNewBuild(): Promise<void> {",
  "let geomozUpdateNoticeShown = false;\nasync function offerReloadIfNewBuild(): Promise<void> {\n  if (geomozUpdateNoticeShown) return;",
  "one GeoMoz update notice per tab");
entry=once(entry,
  "  await i18nReady;\n  offerAppUpdate({",
  "  await i18nReady;\n  if (geomozUpdateNoticeShown) return;\n  geomozUpdateNoticeShown = true;\n  offerAppUpdate({",
  "dedupe concurrent service worker update checks");
write("main.tsx",entry);
// Product identity is owned by GeoMoz; the engine remains the attributed MIT fork.
brandUpstreamLocales(resolve(app,"i18n/locales"));
const about=read("components/layout/AboutDialog.tsx");
if(!about.includes("https://geolibre.app")||!about.includes("github.com/opengeos/GeoLibre")){
  throw Error("Upstream About dialog has drifted; review product branding integration");
}
write("components/layout/AboutDialog.tsx",readFileSync(new URL("./assets/workbench/GeoMozAboutDialog.tsx",import.meta.url),"utf8"));
let links=read("components/layout/toolbar/constants.ts");
for(const [oldValue,newValue] of [
  ['export const FEEDBACK_URL = "https://github.com/opengeos/GeoLibre/issues";','export const FEEDBACK_URL = "https://github.com/heltrakinho07/Geomoz-Explorer/issues";'],
  ['export const WEBSITE_URL = "https://geolibre.app";','export const WEBSITE_URL = "https://geomoz.geolithica.com/";'],
  ['export const GITHUB_URL = "https://github.com/opengeos/GeoLibre";','export const GITHUB_URL = "https://github.com/heltrakinho07/Geomoz-Explorer";'],
]){
  links=once(links,oldValue,newValue,"GeoMoz public site and support links");
}
write("components/layout/toolbar/constants.ts",links);

const marker=resolve(root,"geomoz-workbench.json");
writeFileSync(marker,JSON.stringify({interface:"geomoz-workbench",version:1,engine:"f69688ed5be750c496b51b865cee513d910a433f"},null,2)+"\n");
console.log("GeoMoz Workbench React interface prepared; engine capability gates, dialogs and map APIs retained.");

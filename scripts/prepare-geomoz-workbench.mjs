#!/usr/bin/env node
/**
 * Compile GeoMoz-owned React chrome against a pinned MIT GIS engine.
 * Fail closed on source drift; never edit minified bundles or proxy DOM clicks.
 */
import { readFileSync,writeFileSync,mkdirSync,existsSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { brandUpstreamLocales } from "./geomoz-brand-locales.mjs";
const root=resolve(process.argv[2]??".geolibre-upstream");
const app=resolve(root,"apps/geolibre-desktop/src");
const read=path=>readFileSync(resolve(app,path),"utf8");
const write=(path,content)=>{const target=resolve(app,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);};
function once(source,needle,replacement,label){
  if(source.split(needle).length!==2)throw Error("GeoMoz source integration anchor changed: "+label);
  return source.replace(needle,replacement);
}
if(!existsSync(resolve(root,"LICENSE")))throw Error("Expected the pinned GeoLibre checkout with its MIT license");
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
for(const name of ["GeoMozWorkbenchChrome.tsx","GeoMozLayerPanel.tsx","GeoMozLayerProperties.tsx","GeoMozSeismicPanel.tsx","GeoMozSeismicAnalysis.tsx","GeoMozEarthscopeStations.tsx","seismic-data.ts","seismic-analytics.ts","earthscope-stations.ts"]){
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
editor=once(editor,"    ...GEO_EDITOR_OPTIONS,","    ...GEO_EDITOR_OPTIONS,\n    ...(!GEOMOZ_ROLLOUT.advancedDrawing ? {\n      drawModes: GEO_EDITOR_OPTIONS.drawModes.filter(mode => [\"polygon\",\"line\",\"rectangle\",\"marker\"].includes(mode)),\n      editModes: GEO_EDITOR_OPTIONS.editModes.filter(mode => [\"select\",\"drag\",\"change\",\"delete\"].includes(mode)),\n      showFeatureProperties: false,\n      enableAttributeEditing: false,\n    } : {}),","curated study-area editor");
editor=once(editor,"if (isGeometryEditSession) geoEditorControl?.closeAttributeEditor();","if (isGeometryEditSession || !GEOMOZ_ROLLOUT.advancedDrawing) geoEditorControl?.closeAttributeEditor();","hide massing attribute form");
writeFileSync(editorPath,editor);
const marker=resolve(root,"geomoz-workbench.json");
writeFileSync(marker,JSON.stringify({interface:"geomoz-workbench",version:1,engine:"f69688ed5be750c496b51b865cee513d910a433f"},null,2)+"\n");
console.log("GeoMoz Workbench React interface prepared; engine capability gates, dialogs and map APIs retained.");

#!/usr/bin/env node
/**
 * Compile GeoMoz-owned React chrome against a pinned MIT GIS engine.
 * Fail closed on source drift; never edit minified bundles or proxy DOM clicks.
 */
import { readFileSync,writeFileSync,mkdirSync,existsSync } from "node:fs";
import { resolve,dirname } from "node:path";
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
      onToggleThemeMode={onToggleThemeMode} onSearch={() => dialogs.setCommandPaletteOpen(true)} viewer={viewer}>
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
for(const name of ["GeoMozWorkbenchChrome.tsx","GeoMozLayerPanel.tsx"]){
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
const marker=resolve(root,"geomoz-workbench.json");
writeFileSync(marker,JSON.stringify({interface:"geomoz-workbench",version:1,engine:"f69688ed5be750c496b51b865cee513d910a433f"},null,2)+"\n");
console.log("GeoMoz Workbench React interface prepared; engine capability gates, dialogs and map APIs retained.");

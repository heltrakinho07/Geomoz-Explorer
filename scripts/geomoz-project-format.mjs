import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

/** Adapt the pinned engine's file boundary; keep its parser and schema intact. */
export function prepareGeoMozProjectFormat(root) {
  const app=resolve(root,"apps/geolibre-desktop/src");
  const patch=(path,needle,replacement)=>{
    const text=readFileSync(path,"utf8");
    if(text.split(needle).length!==2)throw Error("GeoMoz project format anchor changed: "+path);
    writeFileSync(path,text.replace(needle,replacement));
  };
  writeFileSync(resolve(app,"lib/geomoz-project-filename.ts"),readFileSync(new URL("./assets/workbench/geomoz-project-filename.ts",import.meta.url),"utf8"));
  patch(resolve(root,"packages/core/src/project.ts"),'DEFAULT_PROJECT_NAME = "Untitled Project"','DEFAULT_PROJECT_NAME = "Untitled Projecto"');
  const names=resolve(app,"lib/file-names.ts");
  let source=readFileSync(names,"utf8");
  const start=source.indexOf("export function ensureProjectFileName(");
  const end=source.indexOf("\n}",start)+2;
  if(start<0||end<start)throw Error("Missing project name sanitizer");
  source=source.slice(0,start)+'export function ensureProjectFileName(name: string): string {\n  return geomozProjectFileName(name);\n}'+source.slice(end);
  source=source.replace('import { DEFAULT_PROJECT_NAME } from "@geolibre/core";','import { geomozProjectFileName } from "./geomoz-project-filename";');
  writeFileSync(names,source);
  patch(resolve(app,"hooks/useProjectFileActions.ts"),'let saveName = `${defaultProjectName}.geolibre`;','let saveName = ensureProjectFileName(defaultProjectName);');
  const files=resolve(app,"lib/file-io/project-files.ts");
  source=readFileSync(files,"utf8");
  source='import { ensureProjectFileName } from "../file-names";\n'+source;
  source=source.replaceAll('"GeoLibre Project"','"Projecto GeoMoz"')
    .replaceAll('[".geolibre", ".json"]','[".geomoz", ".geolibre", ".json"]')
    .replaceAll('["geolibre", "json"]','["geomoz", "geolibre", "json"]')
    .replace('accept: ".geolibre,.json,.geolibre.json"','accept: ".geomoz,.geolibre,.json,.geolibre.json"')
    .replaceAll('defaultName ?? "project.geolibre"','ensureProjectFileName(defaultName ?? "")');
  writeFileSync(files,source);
  patch(resolve(app,"lib/file-io/paths.ts"),'return name.endsWith(".geolibre") || name.endsWith(".geolibre.json");','return name.endsWith(".geomoz") || name.endsWith(".geolibre") || name.endsWith(".geolibre.json");');
  patch(resolve(app,"lib/file-io/paths.ts"),'return `${path.replace(/\\.json$/i, "")}.geolibre.json`;','return `${path.replace(/\\.json$/i, "")}.geomoz`;');
  // Native file guards must agree with the picker without relaxing path/symlink checks.
  const rust=resolve(root,"apps/geolibre-desktop/src-tauri/src/lib.rs");
  source=readFileSync(rust,"utf8").replaceAll('lower.ends_with(".geolibre") || lower.ends_with(".geolibre.json")','lower.ends_with(".geomoz") || lower.ends_with(".geolibre") || lower.ends_with(".geolibre.json")')
    .replace('resolved.ends_with(".geolibre") || resolved.ends_with(".geolibre.json")','resolved.ends_with(".geomoz") || resolved.ends_with(".geolibre") || resolved.ends_with(".geolibre.json")');
  writeFileSync(rust,source);
  patch(resolve(app,"components/layout/toolbar/ProjectFileDialogs.tsx"),'https://example.com/project.geolibre.json','https://example.com/project.geomoz');
}

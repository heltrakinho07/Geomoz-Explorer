/**
 * Branded copies of the upstream translation catalogs (build time only).
 * Replace user-facing product strings, never translated variables, keys, URLs
 * identifying third-party services, file extensions or technical identifiers.
 * The upstream MIT license and project attribution remain unchanged.
 */
import {readFileSync,writeFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
const genericDesktop={
  pt:"uma aplicação SIG para computador",
  en:"a compatible desktop GIS application",
  es:"una aplicación SIG de escritorio compatible",
  fr:"une application SIG de bureau compatible"
};
function rename(value,lang){
  if(typeof value!=="string")return value;
  // Keep technical identifiers and links in catalog text valid.
  const protectedPieces=[];
  const mask=(v)=>{const key="@GEOMOZ_PROTECTED_"+protectedPieces.length+"@";protectedPieces.push(v);return key;};
  let s=value
    .replace(/https?:\/\/[^\s<>"']+/g,mask)
    .replace(/\bgeolibre[-_.](?:server|app|json|project)\b/gi,mask);
  s=s.replace(/\bGeoLibre Desktop\b/g,genericDesktop[lang]??"a compatible desktop GIS application");
  s=s.replace(/\bGeoLibre\b/g,"GeoMoz");
  // Do not edit citations that are legally required by the original project.
  return s.replace(/@GEOMOZ_PROTECTED_(\d+)@/g,(_,i)=>protectedPieces[Number(i)]);
}
export function brandLocaleCatalog(catalog,lang){
  function visit(value,keypath=[]){
    if(Array.isArray(value))return value.map((v,i)=>visit(v,[...keypath,String(i)]));
    if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,[...keypath,k])]));
    if(keypath.some(k=>/licen[sc]es?|third.party|attribution|copyright/i.test(k)))return value;
    return rename(value,lang);
  }
  const result=visit(catalog);
  if(result.toolbar?.item) {
    result.toolbar.item.saveProjectFileNamePlaceholder="Untitled_Projecto.geomoz";
    if(typeof result.toolbar.item.openProjectFromUrlDesc==="string")
      result.toolbar.item.openProjectFromUrlDesc=result.toolbar.item.openProjectFromUrlDesc.replaceAll(".geolibre.json",".geomoz");
  }
  if(result.about){
    const translations={
      pt:["Sobre o GeoMoz GIS Workspace","Sistema de informação geográfica integrado no GeoMoz."],
      en:["About GeoMoz GIS Workspace","Geospatial workspace integrated with GeoMoz."],
      es:["Acerca de GeoMoz GIS Workspace","Entorno geoespacial integrado en GeoMoz."],
      fr:["À propos de GeoMoz GIS Workspace","Espace de travail géospatial intégré à GeoMoz."]
    };
    const [title,description]=translations[lang]??translations.en;
    result.about.title=title;
    result.about.description=description;
  }
  // The PWA update prompt is a GeoMoz product notice. The upstream English
  // fallback otherwise mentions GeoLibre when an older SW refreshes a tab.
  // Keep labels localized for the two default UI languages.
  if (result.notifications && typeof result.notifications==="object") {
    const labels={
      pt:["Está disponível uma nova versão do GeoMoz GIS Workspace.","Actualizar agora"],
      en:["A new version of GeoMoz GIS Workspace is available.","Reload now"],
      es:["Hay una nueva versión de GeoMoz GIS Workspace disponible.","Recargar ahora"],
      fr:["Une nouvelle version de GeoMoz GIS Workspace est disponible.","Recharger"]
    };
    if (labels[lang]) {
      const [message,reload]=labels[lang];
      result.notifications.appUpdateAvailable=message;
      result.notifications.appUpdateReload=reload;
    }
  }
  return result;
}
export function brandUpstreamLocales(localesDirectory){
  let count=0;
  for(const file of readdirSync(localesDirectory).filter(name=>/^[a-z]{2}\.json$/.test(name))){
    const path=resolve(localesDirectory,file),lang=file.slice(0,2);
    const input=JSON.parse(readFileSync(path,"utf8"));
    const result=brandLocaleCatalog(input,lang);
    writeFileSync(path,JSON.stringify(result,null,2)+"\n");
    count++;
  }
  if(count<2)throw Error("No upstream locale catalogs available to brand.");
  return count;
}

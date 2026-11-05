import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source=readFileSync("artifacts/geomoz-react/public/geomoz-preferences.js","utf8");
function boot(initial={}) {
  const storage=new Map(Object.entries(initial));
  const events=new Map();
  const doc={documentElement:{lang:"pt",dataset:{}},body:{dataset:{geomozApp:"workbench"}}};
  const win={
    addEventListener:(type,callback)=>events.set(type,[...(events.get(type)||[]),callback]),
    dispatchEvent:event=>{for(const callback of events.get(event.type)||[])callback(event);},
  };
  const ctx={
    window:win,document:doc,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}}
  };
  vm.runInNewContext(source,ctx);
  return {storage,window:win,document:doc,api:win.GeoMozPreferences};
}
test("GeoMoz keeps the engine's existing settings and synchronizes language",()=>{
  const b=boot({"geolibre.desktopSettings":JSON.stringify({language:"es",projection:"EPSG:4326"})});
  assert.equal(b.api.getLanguage(),"es");
  assert.equal(b.document.documentElement.lang,"es");
  let notifications=0;
  b.api.subscribe(()=>notifications++);
  b.api.setLanguage("en");
  assert.equal(b.storage.get("geomoz_language"),"en");
  const persisted=JSON.parse(b.storage.get("geolibre.desktopSettings"));
  assert.equal(persisted.language,"en");
  assert.equal(persisted.projection,"EPSG:4326");
  assert.equal(notifications,1);
  b.api.setLanguage("en");
  assert.equal(notifications,1);
});
test("browser reload and cross-tab changes use the same preferences",()=>{
  const a=boot();
  a.api.setLanguage("fr");
  a.api.setReducedMotion(true);
  const b=boot(Object.fromEntries(a.storage));
  assert.equal(b.api.getLanguage(),"fr");
  assert.equal(b.api.getReducedMotion(),true);
  assert.equal(b.document.documentElement.dataset.geomozReducedMotion,"true");
  b.storage.set("geomoz_language","pt");
  b.window.dispatchEvent({type:"storage",key:"geomoz_language",newValue:"pt"});
  assert.equal(b.api.getLanguage(),"pt");
  assert.equal(b.document.documentElement.lang,"pt");
});
test("malformed and unsupported preferences fall back without losing engine state",()=>{
  const b=boot({"geomoz_language":"not-a-locale","geolibre.desktopSettings":"{broken"});
  assert.equal(b.api.getLanguage(),"pt");
  assert.equal(b.api.setLanguage("../../bad"),false);
  assert.equal(b.api.getLanguage(),"pt");
});

test("GeoMoz uses GeoLibre's locale resolution for regional variants and rejects unshipped codes",()=>{
  const a=boot({"geomoz_language":"ES_mx"});
  assert.equal(a.api.getLanguage(),"es");
  assert.equal(a.document.documentElement.lang,"es");
  assert.equal(a.api.setLanguage("fr-FR"),true);
  assert.equal(a.api.getLanguage(),"fr");
  assert.equal(a.storage.get("geomoz_language"),"fr");
  assert.equal(JSON.parse(a.storage.get("geolibre.desktopSettings")).language,"fr");
  assert.equal(a.api.setLanguage("zz"),false);
  assert.equal(a.api.getLanguage(),"fr");
});
test("native GeoLibre settings changes from another tab override stale portal language",()=>{
  const a=boot({"geomoz_language":"pt","geolibre.desktopSettings":JSON.stringify({language:"pt",project:"safe"})});
  a.storage.set("geolibre.desktopSettings",JSON.stringify({language:"de-DE",project:"safe"}));
  a.window.dispatchEvent({type:"storage",key:"geolibre.desktopSettings"});
  assert.equal(a.api.getLanguage(),"de");
  assert.equal(a.storage.get("geomoz_language"),"de","Mirror the canonical engine selection to portal storage");
  assert.equal(JSON.parse(a.storage.get("geolibre.desktopSettings")).project,"safe");
  const b=boot(Object.fromEntries(a.storage));
  assert.equal(b.api.getLanguage(),"de","Reload must preserve the new native GeoLibre language");
});

test("build source uses a single owner of language and a unified settings menu",()=>{
  const chrome=readFileSync("scripts/assets/workbench/GeoMozWorkbenchChrome.tsx","utf8");
  const menu=readFileSync("scripts/assets/workbench/GeoMozSettingsMenu.tsx","utf8");
  const packager=readFileSync("scripts/brand-geolibre-web.mjs","utf8");
  assert.match(chrome,/GeoMozSettingsMenu/);
  assert.doesNotMatch(chrome,/gm-language-picker/);
  assert.match(menu,/geomoz-language-selector/);
  assert.match(menu,/geomoz-theme-toggle/);
  assert.match(packager,/geomoz-preferences\.js/);
});

test("portal document language follows translated catalogs and English fallback",()=>{
  const b=boot();
  b.document.body.dataset.geomozApp="portal";
  for(const lang of ["en","es","fr","pt"]){
    assert.equal(b.api.setLanguage(lang),true);
    assert.equal(b.api.getLanguage(),lang);
    assert.equal(b.document.documentElement.lang,lang);
  }
  b.api.setLanguage("de");
  assert.equal(b.api.getLanguage(),"de","Keep the native GIS preference intact");
  assert.equal(b.document.documentElement.lang,"en","Portal without German catalog renders English fallback");
  b.document.body.dataset.geomozApp="workbench";
  b.api.setLanguage("ar");
  assert.equal(b.document.documentElement.lang,"ar","Native GIS owns RTL and full catalog");
});

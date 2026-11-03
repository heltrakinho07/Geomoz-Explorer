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

test("Portuguese portal does not mislabel untranslated text as another language",()=>{
  const b=boot();
  b.document.body.dataset.geomozApp="portal";
  b.api.setLanguage("en");
  assert.equal(b.api.getLanguage(),"en");
  assert.equal(b.document.documentElement.lang,"pt");
});

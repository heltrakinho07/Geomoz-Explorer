import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root="artifacts/geomoz-react/";
function read(path){return readFileSync(root+path,"utf8");}
test("canonical GeoMoz mark is the original blue globe from GIS Workspace",()=>{
  const svg=read("public/favicon.svg");
  const component=read("src/components/GeoMozBrandIcon.tsx");
  assert.match(svg,/viewBox="0 0 512 512"/);
  assert.match(svg,/#0284c7/);
  assert.match(svg,/linearGradient/);
  assert.match(component,/GEOMOZ_BRAND_ICON = "\/favicon\.svg"/);
  assert.match(component,/<img/);
  assert.doesNotMatch(component,/data:image/);
});
test("all GeoMoz identity surfaces use the same component, not separate globe symbols",()=>{
  const locations=[
    ["src/components/Sidebar.tsx",1],
    ["src/pages/LandingPage.tsx",3],
    ["src/pages/LegalPages.tsx",1],
    ["src/components/PwaInstallPrompt.tsx",1],
    ["src/pages/Explorer.tsx",1],
  ];
  for(const [path,min] of locations){
    const source=read(path);
    assert.match(source,/import GeoMozBrandIcon from "@\/components\/GeoMozBrandIcon"/,path);
    assert.ok((source.match(/<GeoMozBrandIcon\b/g)||[]).length>=min,path);
  }
  assert.doesNotMatch(read("src/components/Sidebar.tsx"),/w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500/);
});
test("main PWA entrypoints and installed icons use the GeoMoz root identity asset",()=>{
  const html=read("index.html");
  assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
  for(const name of ["manifest.webmanifest","manifest.json"]){
    const data=JSON.parse(read("public/"+name));
    assert.ok(data.icons.some(x=>x.src==="/favicon.svg"),name);
    for(const size of ["192","512"]){
      assert.ok(data.icons.some(x=>x.sizes===size+"x"+size),name+" "+size);
    }
  }
});
test("GIS Workspace uses the exact same canonical GeoMoz icon and preserves install assets",()=>{
  const workspace=readFileSync("scripts/assets/workbench/GeoMozWorkbenchChrome.tsx","utf8");
  const packaging=readFileSync("scripts/brand-geolibre-web.mjs","utf8");
  assert.match(workspace,/<img src="\/favicon\.svg" alt=""/);
  assert.doesNotMatch(workspace,/<img src="\/gis-workspace\/favicon\.svg"/);
  assert.match(packaging,/\["favicon\.svg", "favicon\.svg"\]/);
  assert.match(packaging,/cpSync\(logoFile, resolve\(destination, destinationName\)\)/);
  for(const asset of ["icon-192.png","icon-512.png","icon-maskable.png","apple-touch-icon.png"]){
    assert.match(packaging,new RegExp(asset.replace(".","\\.")));
  }
});

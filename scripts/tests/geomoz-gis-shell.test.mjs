import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
test("source preparation rejects drift without touching unrelated source",()=>{
 const root=mkdtempSync(join(tmpdir(),"geomoz-workbench-"));
 try{
  mkdirSync(join(root,"apps/geolibre-desktop/src/components/layout"),{recursive:true});
  writeFileSync(join(root,"LICENSE"),"MIT");
  const path=join(root,"apps/geolibre-desktop/src/components/layout/TopToolbar.tsx");
  writeFileSync(path,"export function TopToolbar(){return null;}");
  const result=spawnSync(process.execPath,[resolve("scripts/prepare-geomoz-workbench.mjs"),root],{encoding:"utf8"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/anchors changed/);
  assert.equal(readFileSync(path,"utf8"),"export function TopToolbar(){return null;}");
 }finally{rmSync(root,{recursive:true,force:true});}
});

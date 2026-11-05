import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync("artifacts/geomoz-react/public/geomoz-theme.js","utf8");
function boot({stored=null,systemDark=false,blocked=false}={}){
 const events=new Map(),values=new Map(stored?[["geomoz_theme",stored]]:[]),classes=new Set();
 const media={matches:systemDark,addEventListener:(type,cb)=>{media.change=cb;}};
 const root={classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)},dataset:{},style:{}};
 const meta={content:""};
 const window={matchMedia:()=>media,addEventListener:(type,cb)=>{const list=events.get(type)||[];list.push(cb);events.set(type,list);},dispatchEvent:event=>{for(const cb of events.get(event.type)||[])cb(event);}};
 const context={window,document:{documentElement:root,querySelectorAll:()=>[meta]},localStorage:{getItem:key=>{if(blocked)throw Error("blocked");return values.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error("blocked");values.set(key,value);}},CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}}};
 vm.runInNewContext(source,context);
 return {window,root,meta,values,classes,media,api:window.GeoMozTheme};
}
test("explicit preference wins, persists and notifies once",()=>{
 const b=boot({stored:"dark"});let calls=0;b.api.subscribe(()=>calls++);
 assert.equal(b.api.getTheme(),"dark");assert.ok(b.classes.has("dark"));assert.equal(b.root.style.colorScheme,"dark");
 b.api.toggle();assert.equal(b.values.get("geomoz_theme"),"light");assert.equal(calls,1);assert.equal(b.meta.content,"#f4f7fb");
 b.api.setTheme("invalid");assert.equal(b.api.getTheme(),"light");assert.equal(calls,1);
});
test("system changes remain automatic until the user chooses a mode",()=>{
 const b=boot();b.media.matches=true;b.media.change();assert.equal(b.api.getTheme(),"dark");
 assert.equal(b.values.has("geomoz_theme"),false);
 b.media.matches=false;b.media.change();assert.equal(b.api.getTheme(),"light");
 b.api.setTheme("dark");b.media.change();assert.equal(b.api.getTheme(),"dark");
});
test("cross-tab and legacy theme events update all subscribers",()=>{
 const b=boot();let calls=0;const unsubscribe=b.api.subscribe(()=>calls++);
 b.window.dispatchEvent({type:"storage",key:"geomoz_theme",newValue:"dark"});
 assert.equal(b.api.getTheme(),"dark");assert.equal(calls,1);
 b.window.dispatchEvent({type:"geomoz_theme_changed",detail:"light"});assert.equal(b.api.getTheme(),"light");assert.equal(calls,2);
 unsubscribe();b.api.toggle();assert.equal(calls,2);
});
test("denied storage does not stop rendering or toggling",()=>{
 const b=boot({blocked:true,systemDark:true});assert.equal(b.api.getTheme(),"dark");b.api.toggle();assert.equal(b.api.getTheme(),"light");assert.equal(b.root.dataset.geomozTheme,"light");
});

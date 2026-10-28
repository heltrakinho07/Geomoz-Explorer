import test from 'node:test';
import assert from 'node:assert/strict';
import {printPixelRatio,withPrintResolution} from '../assets/workbench/geomoz-print-resolution.ts';
test('print buffer respects dimensions and memory bounds',()=>{
 assert.equal(printPixelRatio(1200,800,1),4);
 assert.equal(printPixelRatio(2400,1600,1),2);
 assert.throws(()=>printPixelRatio(0,800,1));
});
function fake(){let ratio=1;const listeners=new Set();return {
 getPixelRatio:()=>ratio,setPixelRatio:r=>{ratio=r},getCanvas:()=>({clientWidth:1200,clientHeight:800}),loaded:()=>true,
 on:(_,f)=>listeners.add(f),off:(_,f)=>listeners.delete(f),triggerRepaint:()=>queueMicrotask(()=>{for(const f of listeners)f()})
};}
test('capture uses rendered resolution and restores original after failure',async()=>{
 const map=fake();
 await assert.rejects(withPrintResolution(map,async()=>{assert.equal(map.getPixelRatio(),4);throw Error('CORS')}),/CORS/);
 assert.equal(map.getPixelRatio(),1);
});
test('overlapping capture requests are serialized and restored',async()=>{
 const map=fake();let active=0;
 const capture=async()=>{assert.equal(active++,0);assert.equal(map.getPixelRatio(),4);await Promise.resolve();active--;return 42};
 assert.deepEqual(await Promise.all([withPrintResolution(map,capture),withPrintResolution(map,capture)]),[42,42]);
 assert.equal(map.getPixelRatio(),1);
});

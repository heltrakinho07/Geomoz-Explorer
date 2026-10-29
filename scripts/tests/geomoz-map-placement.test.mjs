import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeGeoMozMapFrame as frame,normalizeGeoMozLegendPlacement as legend} from '../assets/workbench/geomoz-map-placement.ts';
test('existing layouts keep automatic map and legend placement',()=>{assert.equal(frame(undefined),null);assert.equal(legend(null),null)});
test('map frame stays inside page with usable dimensions',()=>{assert.deepEqual(frame({x:200,y:99,width:500,height:0}),{x:95,y:95,width:5,height:5});assert.deepEqual(frame({x:5,y:10,width:60,height:75}),{x:5,y:10,width:60,height:75});});
test('legend values are finite and survive project serialization',()=>{const p=legend({x:70,y:20,scale:1.5});assert.deepEqual(legend(JSON.parse(JSON.stringify(p))),p);assert.equal(legend({scale:Infinity}).scale,1);});

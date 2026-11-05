import test from "node:test";
import assert from "node:assert/strict";
import {seismicProfile,dailyMagnitudeSeries,gutenbergRichter,magnitudeSize,depthColor,seismicSymbologyStyle} from "../assets/workbench/seismic-analytics.ts";
import {earthscopeStationUrl,parseEarthscopeStations,queryEarthscopeStations,stationsToGeoJSON} from "../assets/workbench/earthscope-stations.ts";
function ev(i,m=3,depth=20,lon=34,lat=-20,kind="Mw"){return{id:String(i),source:"usgs",time:"2025-01-"+String(i%25+1).padStart(2,"0")+"T12:00:00Z",longitude:lon,latitude:lat,depthKm:depth,magnitude:m,magnitudeType:kind,place:"",eventType:"earthquake",sourceUrl:""};}
test("earthquake symbol radius increases with magnitude and depth colors vary scientifically",()=>{
  assert.ok(magnitudeSize(5)>magnitudeSize(3));
  assert.equal(depthColor(10),"#0284c7");
  assert.equal(depthColor(90),"#f59e0b");
  assert.equal(depthColor(400),"#dc2626");
  assert.equal(depthColor(null),"#64748b");
  const style=seismicSymbologyStyle();
  assert.equal(style.pointRenderer,"single");
  assert.equal(style.proportionalSizeProperty,"magnitude");
  assert.equal(style.proportionalSizeEnabled,true);
  assert.equal(style.vectorStyleMode,"expression");
  assert.doesNotThrow(()=>JSON.parse(style.vectorStyleExpression));
});
test("A-B profile retains only events inside corridor, depth positive down",()=>{
  const data=[ev(1,3,20,34,-19.5),ev(2,4,120,34,-19.2),ev(3,5,30,40,-19.5)];
  const p=seismicProfile(data,[34,-20],[34,-19],45);
  assert.equal(p.points.length,2);
  assert.ok(p.points[0].distanceKm>=0);
  assert.equal(p.points[1].depthKm,120);
  assert.throws(()=>seismicProfile(data,[0,0],[0,0]),/inválido/);
  assert.throws(()=>seismicProfile(data,[0,0],[90,0]),/inválido/);
});
test("time series and homogeneous Gutenberg-Richter MLE",()=>{
  const data=Array.from({length:50},(_,i)=>ev(i,3+i%7/10));
  const days=dailyMagnitudeSeries(data);
  assert.ok(days.length>1);
  assert.equal(days.reduce((n,d)=>n+d.count,0),50);
  const gr=gutenbergRichter(data,3,.1);
  assert.equal(gr.n,50);assert.equal(gr.homogeneous,true);
  assert.ok(gr.b!==null&&gr.b>0);assert.ok(gr.a!==null);
  const short=gutenbergRichter(data.slice(0,4),3);
  assert.equal(short.b,null);
  assert.match(short.warning,/exploratória/);
  const mixed=gutenbergRichter([...data.slice(0,26),ev(52,3.1,20,34,-20,"mb")],3);
  assert.equal(mixed.homogeneous,false);
  assert.match(mixed.warning,/exploratória/);
});
const textResponse=[
"#Network|Station|Latitude|Longitude|Elevation|SiteName|StartTime|EndTime",
"6H|CHM|-19.1|33.48|680|Chimoio|2010-01-01T00:00:00|",
"AF|BEI|-19.84|34.83|4|Beira|2011-02-01T00:00:00|2014-01-01T00:00:00"
].join("\n");
test("EarthScope FDSN station text and URL support bounded geographic queries",async()=>{
  const url=new URL(earthscopeStationUrl([29,-27,42,-10],"6H,AF"));
  assert.equal(url.origin,"https://service.earthscope.org");
  assert.equal(url.searchParams.get("format"),"text");
  assert.equal(url.searchParams.get("level"),"station");
  assert.equal(url.searchParams.get("network"),"6H,AF");
  assert.throws(()=>earthscopeStationUrl([100,10,10,20]),/inválida/);
  const parsed=parseEarthscopeStations(textResponse);
  assert.equal(parsed.stations.length,2);
  assert.equal(parsed.stations[0].network,"6H");
  assert.equal(parsed.stations[0].latitude,-19.1);
  assert.equal(parsed.stations[0].elevationM,680);
  assert.equal(parsed.stations[0].endTime,"");
  const result=await queryEarthscopeStations([29,-27,42,-10],"6H",undefined,async()=>new Response(textResponse,{status:200}));
  assert.equal(result.stations.length,2);
  const geo=stationsToGeoJSON(result.stations);
  assert.equal(geo.features[0].geometry.coordinates[0],33.48);
  assert.equal(geo.features[1].properties.rede,"AF");
});

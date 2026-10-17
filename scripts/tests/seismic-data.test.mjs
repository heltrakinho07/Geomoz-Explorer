import test from "node:test";
import assert from "node:assert/strict";
import {
  SEISMIC_AREAS, validateSeismicQuery, buildSeismicQueryUrl, normalizeUsgsGeoJson,
  parseIscFdsnText, eventsToGeoJSON, eventsToCSV, querySeismicCatalog
} from "../assets/workbench/seismic-data.ts";

const query={
  provider:"usgs",start:"2026-01-01",end:"2026-01-31",
  bbox:SEISMIC_AREAS.mozambique.bounds,minMagnitude:2,minDepth:0,maxDepth:700,limit:50
};
const usgsPayload={
  type:"FeatureCollection",
  features:[
    {type:"Feature",id:"us-test",geometry:{type:"Point",coordinates:[34.2,-19.1,10.1]},properties:{mag:4.4,magType:"mb",time:1767225600000,place:"Centro de Moçambique",type:"earthquake",net:"us",url:"https://earthquake.usgs.gov/earthquakes/eventpage/us-test"}},
    {type:"Feature",id:"bad",geometry:{type:"Point",coordinates:[999,30,12]},properties:{time:1767225600000}},
    {type:"Feature",id:"invalid-date",geometry:{type:"Point",coordinates:[34.2,-19.1,10.1]},properties:{time:"invalid"}}
  ]
};
const iscSample=[
"#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType",
"1001|2026-01-11T12:00:00.0000|-19.12|34.1|25.2|ISC|ISC|ISC||mb|4.10|ISC|Mozambique|earthquake",
"1002|2026-01-12T12:00:00.0000|-19.3|34.3||ISC|ISC|ISC||ml||ISC|Mozambique|earthquake",
"1003|2026-01-12T12:00:00.0000|-19.4|34.4|1|ISC|ISC|ISC||ml|2|ISC|Mozambique|quarry blast"
].join("\n");

test("FDSN URL: approved host, fixed bounding box and depth/time filters",()=>{
  const url=new URL(buildSeismicQueryUrl(query));
  assert.equal(url.origin,"https://earthquake.usgs.gov");
  assert.equal(url.searchParams.get("format"),"geojson");
  assert.equal(url.searchParams.get("eventtype"),"earthquake");
  assert.equal(url.searchParams.get("minlatitude"),"-27");
  assert.equal(url.searchParams.get("maxlongitude"),"42");
  assert.equal(url.searchParams.get("limit"),"50");
  assert.equal(url.searchParams.get("minmagnitude"),"2");
  const isc=new URL(buildSeismicQueryUrl({...query,provider:"isc"}));
  assert.equal(isc.origin,"https://www.isc.ac.uk");
  assert.equal(isc.searchParams.get("format"),"text");
  assert.equal(isc.searchParams.has("eventtype"),false);
});

test("Invalid geospatial query, invalid dates and excessive results fail before network",()=>{
  assert.throws(()=>validateSeismicQuery({...query,start:"2026-02-20",end:"2026-01-02"}),/período/);
  assert.throws(()=>validateSeismicQuery({...query,start:"2026-02-31"}),/período/);
  assert.throws(()=>validateSeismicQuery({...query,bbox:[30,20,20,25]}),/Coordenadas/);
  assert.throws(()=>validateSeismicQuery({...query,minDepth:700,maxDepth:100}),/profundidade/);
  assert.throws(()=>validateSeismicQuery({...query,limit:2001}),/Limite/);
});

test("USGS GeoJSON normalises UTC, magnitude and depth, dropping invalid geometry",()=>{
  const rows=normalizeUsgsGeoJson(usgsPayload);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,"us-test");
  assert.equal(rows[0].depthKm,10.1);
  assert.equal(rows[0].magnitude,4.4);
  assert.equal(rows[0].time,"2026-01-01T00:00:00.000Z");
  assert.throws(()=>normalizeUsgsGeoJson({type:"Other",features:[]}),/GeoJSON/);
});

test("ISC FDSN pipe text uses header names and filters quarry blasts",()=>{
  const rows=parseIscFdsnText(iscSample);
  assert.equal(rows.length,2);
  assert.equal(rows[0].source,"isc");
  assert.equal(rows[0].latitude,-19.12);
  assert.equal(rows[0].depthKm,25.2);
  assert.equal(rows[0].time,"2026-01-11T12:00:00.000Z");
  assert.equal(rows[1].magnitude,null);
  assert.equal(rows[1].depthKm,null);
  assert.throws(()=>parseIscFdsnText("#EventID|Time\nA|2026-01-01"),/falta/);
});

test("GeoJSON and CSV exports retain origin and attribute metadata",()=>{
  const e=normalizeUsgsGeoJson(usgsPayload)[0];
  const collection=eventsToGeoJSON([e]);
  assert.equal(collection.features[0].geometry.coordinates[0],34.2);
  assert.equal(collection.features[0].properties.profundidade_km,10.1);
  assert.equal(collection.features[0].properties.fonte,"USGS");
  assert.match(eventsToCSV([e]),/us-test,usgs/);
  assert.equal(eventsToGeoJSON([]).features.length,0);
});

test("USGS actual fetch pipeline and empty catalogue 204 work without storage",async()=>{
  const result=await querySeismicCatalog(query,{fetcher:async(url)=> {
    assert.ok(url.includes("earthquake.usgs.gov"));
    return new Response(JSON.stringify(usgsPayload),{status:200,headers:{"Content-Type":"application/json"}});
  }});
  assert.equal(result.events.length,1);
  assert.equal(result.truncated,false);
  const empty=await querySeismicCatalog({...query,provider:"isc"},{fetcher:async()=>new Response(null,{status:204})});
  assert.equal(empty.events.length,0);
});

test("Truncated result warns about incomplete catalogue",async()=>{
  const result=await querySeismicCatalog({...query,limit:1},{fetcher:async()=>new Response(JSON.stringify({...usgsPayload,features:[usgsPayload.features[0]]}),{status:200})});
  assert.equal(result.truncated,true);
});

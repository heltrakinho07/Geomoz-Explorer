import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {brandLocaleCatalog} from "../geomoz-brand-locales.mjs";

test("GeoMoz owns visible UI translations; technical paths and open-source URLs are retained",()=>{
  const input={
    about:{title:"Sobre o GeoLibre",description:"GeoLibre é um SIG."},
    startup:{label:"Abrir GeoLibre",desktopOnly:"Requer GeoLibre Desktop.",technical:"Instale geolibre-server."},
    links:{legal:"https://github.com/opengeos/GeoLibre",example:"Análise GeoLibre"},
    nested:["GeoLibre Workbench",{label:"Projecto GeoLibre"}]
  };
  const result=brandLocaleCatalog(input,"pt");
  assert.equal(result.about.title,"Sobre o GeoMoz GIS Workspace");
  assert.match(result.about.description,/GeoMoz/);
  assert.equal(result.startup.label,"Abrir GeoMoz");
  assert.match(result.startup.desktopOnly,/aplicação SIG para computador/);
  assert.equal(result.startup.technical,"Instale geolibre-server.");
  assert.equal(result.links.legal,"https://github.com/opengeos/GeoLibre");
  assert.deepEqual(result.nested,["GeoMoz Workbench",{label:"Projecto GeoMoz"}]);
  assert.match(input.about.title,/GeoLibre/,"should not mutate original translations");
});
test("German/English locale fallback never falsely offers a GeoMoz Desktop product",()=>{
  const result=brandLocaleCatalog({notice:"Requires GeoLibre Desktop.",about:{title:"About GeoLibre"}},"en");
  assert.equal(result.about.title,"About GeoMoz GIS Workspace");
  assert.match(result.notice,/compatible desktop GIS application/);
  assert.doesNotMatch(result.notice,/GeoMoz Desktop/);
});
test("attribution keys remain verbatim when an open-source component is credited",()=>{
  const result=brandLocaleCatalog({thirdParty:{license:"GeoLibre is MIT licensed"},copyright:"Copyright GeoLibre",normal:"GeoLibre tools"},"pt");
  assert.equal(result.thirdParty.license,"GeoLibre is MIT licensed");
  assert.equal(result.copyright,"Copyright GeoLibre");
  assert.equal(result.normal,"GeoMoz tools");
});
test("pinned upstream is adapted at source rather than through client-side DOM rewrites",()=>{
  const prepare=readFileSync("scripts/prepare-geomoz-workbench.mjs","utf8");
  const about=readFileSync("scripts/assets/workbench/GeoMozAboutDialog.tsx","utf8");
  const chrome=readFileSync("scripts/assets/workbench/GeoMozWorkbenchChrome.tsx","utf8");
  assert.match(prepare,/brandUpstreamLocales/);
  assert.match(prepare,/components\/layout\/AboutDialog\.tsx/);
  assert.match(prepare,/GeoMozAboutDialog\.tsx/);
  assert.match(prepare,/geomoz\.geolithica\.com/);
  assert.match(about,/third-party-notices\.html/);
  assert.doesNotMatch(about,/fetchLatestRelease|GeoLibre/);
  assert.match(chrome,/geomoz-about-trigger/);
  assert.match(chrome,/data-testid="geomoz-workbench-chrome"/);
});

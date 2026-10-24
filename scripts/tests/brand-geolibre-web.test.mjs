import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const brandScript = resolve("scripts/brand-geolibre-web.mjs");

function fixture(html) {
  const work = mkdtempSync(join(tmpdir(), "geomoz-geolibre-"));
  const src = join(work, "upstream");
  const dst = join(work, "dist", "public", "gis-workspace");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "index.html"), html);
  writeFileSync(join(src, "asset.txt"), "raster worker sample");
  mkdirSync(join(src, "assets"));
  writeFileSync(join(src, "assets/app.js"), 'console.log("geomoz-workbench-chrome","geomoz-layer-catalog");');
  writeFileSync(join(src, "manifest.webmanifest"), JSON.stringify({name:"GeoLibre",short_name:"GeoLibre",start_url:"/gis-workspace/",scope:"/gis-workspace/",theme_color:"#2f8f85",icons:[{src:"pwa-192x192.png",sizes:"192x192"}]}));
  const license = join(work, "LICENSE");
  writeFileSync(license, "MIT License\nCopyright (c) 2026 Qiusheng Wu\n");
  return { work, src, dst, license };
}

test("bundles the real web shell under the GIS subpath with branding and MIT notice", () => {
  const f = fixture('<html lang="en"><head><title>GeoLibre</title><meta name="description" content="GeoLibre platform"/><meta name="apple-mobile-web-app-title" content="GeoLibre"/><link rel="icon" type="image/png" href="/gis-workspace/favicon.png"><link rel="shortcut icon" href="/gis-workspace/favicon.ico"><link rel="apple-touch-icon" href="/gis-workspace/apple-touch-icon.png"><meta name="theme-color" content="#2f8f85"><script src="/gis-workspace/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  try {
    const result = spawnSync(process.execPath, [brandScript, f.src, f.dst, f.license], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(join(f.dst, "index.html"), "utf8");
    const cfg = JSON.parse(readFileSync(join(f.dst, "deployment.json"), "utf8"));
    assert.match(html, /geomoz-brand\.css/);
    assert.match(html, /data-geomoz-auth="pending"/);
    assert.match(html, /geomoz-auth-gate\.js\?v=[a-f0-9]{12}/);
    assert.match(html, /geomoz-auth-splash/);
    assert.doesNotMatch(html, /<script\b[^>]*src="\/gis-workspace\/assets\//);
    const gate = readFileSync(join(f.dst, "geomoz-auth-gate.js"), "utf8");
    assert.match(gate, /geomoz:workspace-auth-state/);
    assert.match(gate, /\/auth\/workspace-check/);
    assert.match(gate, /\/gis-workspace\/assets\/app\.js/);
    assert.match(gate, /bridge\?\.contentWindow/);
    assert.doesNotMatch(gate, /__GEOMOZ_ENTRYPOINTS__/);
    assert.match(html, /data-geomoz-app="workbench"/);
    assert.match(html, /geomoz-theme\.js\?v=[a-f0-9]{12}/);
    assert.doesNotMatch(html, /geomoz-shell|geomoz-gis-commandbar|data-geomoz-menu/);
    assert.equal(cfg.branding.appName, "GeoMoz GIS Workspace");
    assert.equal(cfg.sharing.shareUrl, "off");
    assert.equal(cfg.ai.enabled, false);
    assert.equal(cfg.capabilities, undefined);
    assert.ok(existsSync(join(f.dst, "GEOLIBRE-LICENSE.txt")));
    assert.ok(existsSync(join(f.dst, "third-party-notices.html")));
    const legal = readFileSync(join(f.dst, "third-party-notices.html"), "utf8");
    assert.match(legal,/GeoLibre — motor GIS de código aberto/);
    assert.match(legal,/Qiusheng Wu/);
    assert.match(legal,/GEOLIBRE-LICENSE\.txt/);
    assert.match(html,/<html lang="pt">/);
    assert.match(html,/content="GeoMoz GIS Workspace"\s*\/>/);
    assert.match(html,/meta name="description" content="GeoMoz GIS Workspace:/);
    assert.doesNotMatch(html,/GeoLibre platform|content="GeoLibre"/);

    assert.equal(readFileSync(join(f.dst, "asset.txt"), "utf8"), "raster worker sample");
    const css = readFileSync(join(f.dst, "geomoz-brand.css"), "utf8");
    const manifest = JSON.parse(readFileSync(join(f.dst, "manifest.webmanifest"), "utf8"));
    assert.match(css, /--geomoz-navy: #020617/);
    assert.match(css, /--geomoz-blue: #0284c7/);
    assert.match(css, /html\.dark/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /gm-workbench-chrome/);
    assert.match(css, /gm-catalog/);
    assert.equal(cfg.interface.name, "geomoz-workbench");
    assert.ok(existsSync(join(f.dst, "geomoz-theme.js")));
    assert.ok(!existsSync(join(f.dst, "geomoz-shell.js")));
    assert.match(html, /GeoMoz GIS Workspace<\/title>/);
    const iconHref = html.match(/href="(\/gis-workspace\/favicon\.svg\?v=[a-f0-9]{12})"/)?.[1];
    assert.ok(iconHref, "GIS Workspace favicon is the canonical icon for both applications");
    const version = iconHref.split("?v=")[1];
    for (const [relation, target] of [
      ["icon", "/gis-workspace/favicon.svg"], ["apple-touch-icon", "/gis-workspace/apple-touch-icon.png"],
    ]) {
      const tag = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0])
        .filter(link => link.includes(`rel="${relation}"`) && link.includes(`href="${target}?v=${version}"`));
      assert.equal(tag.length, 1, `Expected one canonical ${relation} pointing to ${target}`);
    }
    assert.doesNotMatch(html, /href="\/(?:favicon|apple-touch-icon)\./);
    assert.equal([...html.matchAll(/rel="(?:icon|shortcut icon|apple-touch-icon)"/g)].length, 2);

    assert.match(html, /geomoz-brand\.css\?v=[a-f0-9]{12}/);
    assert.doesNotMatch(html, /name="theme-color" content="#2f8f85"/);
    assert.match(html, /name="theme-color" content="#082f49"/);
    assert.equal(manifest.name, "GeoMoz GIS Workspace");
    assert.equal(manifest.short_name, "GeoMoz GIS");
    assert.equal(manifest.start_url, "/gis-workspace/");
    assert.equal(manifest.scope, "/gis-workspace/");
    assert.equal(manifest.theme_color, "#0284c7");
    for (const [size, target] of [
      ["any", "/gis-workspace/favicon.svg"], ["32x32", "/gis-workspace/favicon.png"], ["192x192", "/gis-workspace/pwa-192x192.png"],
      ["512x512", "/gis-workspace/pwa-512x512.png"],
    ]) {
      assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.src === `${target}?v=${version}`));
    }
    assert.ok(manifest.icons.some(icon => icon.purpose === "maskable" && icon.src === `/gis-workspace/maskable-icon-512x512.png?v=${version}`));
    assert.ok(existsSync(join(f.dst, "favicon.svg")));
    assert.equal(readFileSync(join(f.dst, "favicon.svg"), "utf8"),
      readFileSync(resolve("artifacts/geomoz-react/public/favicon.svg"), "utf8"),
      "GIS Workspace and Explorer must ship exactly the same GeoMoz SVG icon");
    assert.ok(existsSync(join(f.dst, "pwa-192x192.png")));
    assert.ok(existsSync(join(f.dst, "pwa-512x512.png")));
    assert.ok(existsSync(join(f.dst, "maskable-icon-512x512.png")));
  } finally {
    rmSync(f.work, { recursive: true, force: true });
  }
});

test("refuses a root-base GeoLibre build", () => {
  const f = fixture('<html><head><script src="/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  try {
    const result = spawnSync(process.execPath, [brandScript, f.src, f.dst, f.license], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(f.dst, "index.html")), false);
  } finally {
    rmSync(f.work, { recursive: true, force: true });
  }
});

test("refuses to delete outside dedicated workspace destination", () => {
  const f = fixture('<html><head><script src="/gis-workspace/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  try {
    const result = spawnSync(process.execPath, [brandScript, f.src, join(f.work, "other"), f.license], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(f.work, { recursive: true, force: true });
  }
});

test("refuses an unmodified engine build and preserves an existing destination",()=>{
 const f=fixture('<html><head><script src="/gis-workspace/assets/app.js"></script></head><body><div id="root"></div></body></html>');
 try{
  writeFileSync(join(f.src,"assets/app.js"),'console.log("Original interface");');
  mkdirSync(f.dst,{recursive:true});writeFileSync(join(f.dst,"keep.txt"),"previous valid build");
  const result=spawnSync(process.execPath,[brandScript,f.src,f.dst,f.license],{encoding:"utf8"});
  assert.notEqual(result.status,0);assert.match(result.stderr,/GeoMoz-owned React interface/);
  assert.equal(readFileSync(join(f.dst,"keep.txt"),"utf8"),"previous valid build");
 }finally{rmSync(f.work,{recursive:true,force:true});}
});

test("gates the Vite module entry and rejects unguarded inline app code", () => {
  const moduleFixture = fixture('<html lang="en"><head><title>GeoLibre</title><script type="module" crossorigin src="/gis-workspace/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>');
  const badFixture = fixture('<html><head><script>window.unguarded = true</script><script type="module" src="/gis-workspace/assets/index.js"></script></head><body><div id="root"></div></body></html>');
  try {
    const built = spawnSync(process.execPath, [brandScript, moduleFixture.src, moduleFixture.dst, moduleFixture.license], { encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(join(moduleFixture.dst, "index.html"), "utf8");
    assert.doesNotMatch(html, /<script\\b[^>]*src="\\/gis-workspace\\/assets\\//);
    const boot = readFileSync(join(moduleFixture.dst, "geomoz-auth-gate.js"), "utf8");
    assert.match(boot, /"module":true/);
    assert.ok(boot.includes('"src":"/gis-workspace/assets/index-abc.js"'));
    const bad = spawnSync(process.execPath, [brandScript, badFixture.src, badFixture.dst, badFixture.license], { encoding: "utf8" });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /entrypoints must be gated/);
    assert.equal(existsSync(join(badFixture.dst, "index.html")), false);
  } finally {
    rmSync(moduleFixture.work, { recursive: true, force: true });
    rmSync(badFixture.work, { recursive: true, force: true });
  }
});

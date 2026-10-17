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
  writeFileSync(join(src, "manifest.webmanifest"), JSON.stringify({name:"GeoLibre",short_name:"GeoLibre",start_url:"/gis-workspace/",scope:"/gis-workspace/",theme_color:"#2f8f85",icons:[{src:"pwa-192x192.png",sizes:"192x192"}]}));
  const license = join(work, "LICENSE");
  writeFileSync(license, "MIT License\nCopyright (c) 2026 Qiusheng Wu\n");
  return { work, src, dst, license };
}

test("bundles the real web shell under the GIS subpath with branding and MIT notice", () => {
  const f = fixture('<html><head><title>GeoLibre</title><link rel="icon" type="image/png" href="/gis-workspace/favicon.png"><meta name="theme-color" content="#2f8f85"><script src="/gis-workspace/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  try {
    const result = spawnSync(process.execPath, [brandScript, f.src, f.dst, f.license], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(join(f.dst, "index.html"), "utf8");
    const cfg = JSON.parse(readFileSync(join(f.dst, "deployment.json"), "utf8"));
    assert.match(html, /geomoz-brand\.css/);
    assert.match(html, /data-geomoz-app="workbench"/);
    assert.match(html, /geomoz-theme\.js\?v=[a-f0-9]{12}/);
    assert.doesNotMatch(html, /geomoz-shell|geomoz-gis-commandbar|data-geomoz-menu/);
    assert.equal(cfg.branding.appName, "GeoMoz GIS Workspace");
    assert.equal(cfg.sharing.shareUrl, "off");
    assert.equal(cfg.ai.enabled, false);
    assert.equal(cfg.capabilities, undefined);
    assert.ok(existsSync(join(f.dst, "GEOLIBRE-LICENSE.txt")));
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
    assert.match(html, /href="\/gis-workspace\/favicon\.svg"/);
    assert.match(html, /geomoz-brand\.css\?v=[a-f0-9]{12}/);
    assert.doesNotMatch(html, /name="theme-color" content="#2f8f85"/);
    assert.match(html, /name="theme-color" content="#082f49"/);
    assert.equal(manifest.name, "GeoMoz GIS Workspace");
    assert.equal(manifest.short_name, "GeoMoz GIS");
    assert.equal(manifest.start_url, "/gis-workspace/");
    assert.equal(manifest.scope, "/gis-workspace/");
    assert.equal(manifest.theme_color, "#0284c7");
    assert.ok(existsSync(join(f.dst, "favicon.svg")));
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

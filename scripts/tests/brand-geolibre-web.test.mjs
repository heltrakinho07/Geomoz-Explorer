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
  const license = join(work, "LICENSE");
  writeFileSync(license, "MIT License\nCopyright (c) 2026 Qiusheng Wu\n");
  return { work, src, dst, license };
}

test("bundles the real web shell under the GIS subpath with branding and MIT notice", () => {
  const f = fixture('<html><head><script src="/gis-workspace/assets/app.js"></script></head><body><div id="root"></div></body></html>');
  try {
    const result = spawnSync(process.execPath, [brandScript, f.src, f.dst, f.license], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(join(f.dst, "index.html"), "utf8");
    const cfg = JSON.parse(readFileSync(join(f.dst, "deployment.json"), "utf8"));
    assert.match(html, /geomoz-brand\.css/);
    assert.match(html, /href="\/mapa"/);
    assert.equal(cfg.branding.appName, "GeoMoz GIS Workspace");
    assert.equal(cfg.sharing.shareUrl, "off");
    assert.equal(cfg.ai.enabled, false);
    assert.equal(cfg.capabilities, undefined);
    assert.ok(existsSync(join(f.dst, "GEOLIBRE-LICENSE.txt")));
    assert.equal(readFileSync(join(f.dst, "asset.txt"), "utf8"), "raster worker sample");
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

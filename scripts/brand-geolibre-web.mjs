#!/usr/bin/env node
/**
 * Package the GeoMoz-owned Workbench UI compiled against pinned GeoLibre (MIT).
 * Source integration runs before compilation; this step adds shared theme,
 * deployment policy, identity assets and license attribution.
 *
 * Usage: node scripts/brand-geolibre-web.mjs <geolibre-dist> <geomoz-output> <geolibre-license>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const [sourceArg, destinationArg, licenseArg] = process.argv.slice(2);
if (!sourceArg || !destinationArg || !licenseArg) {
  console.error("Usage: node scripts/brand-geolibre-web.mjs <upstream-dist> <target/gis-workspace> <upstream-LICENSE>");
  process.exit(2);
}
const source = resolve(sourceArg);
const destination = resolve(destinationArg);
const license = resolve(licenseArg);
if (
  basename(destination) !== "gis-workspace" ||
  basename(dirname(destination)) !== "public" ||
  basename(dirname(dirname(destination))) !== "dist" ||
  destination === source ||
  destination.startsWith(source + "/")
) {
  throw new Error("Refusing to replace a directory outside dist/public/gis-workspace");
}
if (!existsSync(resolve(source, "index.html")) || !existsSync(license)) {
  throw new Error("GeoLibre build and upstream MIT LICENSE are required");
}
const html = readFileSync(resolve(source, "index.html"), "utf8");
if (!html.includes("/gis-workspace/") || !html.includes('id="root"')) {
  throw new Error("GeoLibre was not built with GEOLIBRE_APP_BASE=/gis-workspace/");
}
// Refuse to publish the original visual shell if source preparation was omitted.
const required = new Set(["geomoz-workbench-chrome", "geomoz-layer-catalog"]);
const assetsDir = resolve(source, "assets");
if (existsSync(assetsDir)) {
  for (const file of readdirSync(assetsDir).filter(name => name.endsWith(".js"))) {
    const code = readFileSync(resolve(assetsDir, file), "utf8");
    for (const marker of required) if (code.includes(marker)) required.delete(marker);
    if (!required.size) break;
  }
}
if (required.size) throw new Error("Build the GeoMoz-owned React interface before packaging: missing " + [...required].join(", "));
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, dereference: false });
const brandingCss = readFileSync(new URL("./assets/geolibre-geomoz-theme.css", import.meta.url), "utf8");
const cssVersion = createHash("sha256").update(brandingCss).digest("hex").slice(0, 12);
const themeHref = `<link rel="stylesheet" href="/gis-workspace/geomoz-brand.css?v=${cssVersion}" />`;
const themeJs = readFileSync(new URL("../artifacts/geomoz-react/public/geomoz-theme.js", import.meta.url), "utf8");
const themeVersion = createHash("sha256").update(themeJs).digest("hex").slice(0, 12);
const themeScript = `<script src="/gis-workspace/geomoz-theme.js?v=${themeVersion}"></script>`;
const identityHead = [
  '<link rel="icon" type="image/svg+xml" href="/gis-workspace/favicon.svg" />',
  '<link rel="apple-touch-icon" href="/gis-workspace/apple-touch-icon.png" />',
  '<meta name="theme-color" content="#082f49" />',
  themeHref,
  '<meta name="geomoz-interface" content="workbench-v1" />',
  themeScript,
].join("\n  ");
let branded = html
  // Replace GeoLibre favicons, preserving all script and worker references.
  .replace(/<link\b[^>]*\brel=["'](?:icon|apple-touch-icon)["'][^>]*>/gi, "")
  .replace(/<meta\b[^>]*\bname=["']theme-color["'][^>]*>/gi, "")
  .replace(/<title>[^<]*<\/title>/i, "<title>GeoMoz GIS Workspace</title>")
  .replace(/<html\s+lang=["'][^"']*["']/i, '<html lang="pt"')
  .replace(/<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["'][^"']*["']\s*\/>/i,
    '<meta name="apple-mobile-web-app-title" content="GeoMoz GIS Workspace" />')
  .replace(/<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/>/i,
    '<meta name="description" content="GeoMoz GIS Workspace: explore dados geoespaciais, faça análises vectoriais e raster e construa mapas no navegador." />')
  .replace("</head>", "  " + identityHead + "\n  </head>")
  .replace("<body>", '<body data-geomoz-app="workbench">');
if (
  branded === html ||
  !branded.includes('data-geomoz-app="workbench"') ||
  !branded.includes(themeHref) ||
  !branded.includes(themeScript)
) {
  throw new Error("Unable to brand the built GeoLibre HTML");
}
writeFileSync(resolve(destination, "index.html"), branded);
writeFileSync(
  resolve(destination, "deployment.json"),
  JSON.stringify(
    {
      version: 1,
      branding: { appName: "GeoMoz GIS Workspace", welcome: false },
      interface: { name: "geomoz-workbench", version: 1, revision: process.env.GITHUB_SHA || "local" },
      // Sharing requires its own hosted backend; do not send free GIS projects
      // to another platform. The original local file workflow stays available.
      sharing: { shareUrl: "off" },
      ai: { enabled: false }
    },
    null,
    2
  ) + "\n"
);
writeFileSync(resolve(destination, "geomoz-brand.css"), brandingCss);
writeFileSync(resolve(destination, "geomoz-theme.js"), themeJs);

const publicAssets = fileURLToPath(new URL("../artifacts/geomoz-react/public/", import.meta.url));
const iconMappings = [
  ["favicon.svg", "favicon.svg"],
  ["favicon.png", "favicon.png"],
  ["favicon.ico", "favicon.ico"],
  ["apple-touch-icon.png", "apple-touch-icon.png"],
  ["icon-192.png", "pwa-192x192.png"],
  ["icon-512.png", "pwa-512x512.png"],
  ["icon-maskable.png", "maskable-icon-512x512.png"],
];
for (const [sourceName, destinationName] of iconMappings) {
  const logoFile = resolve(publicAssets, sourceName);
  if (!existsSync(logoFile)) throw new Error("Missing GeoMoz branding asset: " + sourceName);
  cpSync(logoFile, resolve(destination, destinationName));
}

// The app is installed as GeoMoz GIS Workspace; retain GeoLibre PWA runtime.
const manifestFile = resolve(destination, "manifest.webmanifest");
if (existsSync(manifestFile)) {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  Object.assign(manifest, {
    name: "GeoMoz GIS Workspace",
    short_name: "GeoMoz GIS",
    description: "Ambiente SIG profissional GeoMoz para explorar dados, analisar e publicar mapas.",
    start_url: "/gis-workspace/",
    scope: "/gis-workspace/",
    theme_color: "#0284c7",
    background_color: "#020617",
  });
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}

// Keep upstream attribution and copyright text accessible in the product,
 // rather than presenting the open-source engine as an unlicensed proprietary component.
writeFileSync(resolve(destination, "third-party-notices.html"), `<!doctype html>
<html lang="pt"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#082f49"/><title>GeoMoz · Licenças de terceiros</title>
<link rel="icon" href="/gis-workspace/favicon.svg" type="image/svg+xml"/>
<style>body{font:15px/1.65 system-ui,sans-serif;max-width:850px;padding:30px 20px;margin:auto;background:#f8fafc;color:#0f172a}
a{color:#0369a1}h1{font-size:1.75rem}h2{margin-top:2rem}article{border:1px solid #cbd5e1;border-radius:10px;padding:20px;background:#fff}
small{color:#475569}nav{display:flex;gap:16px;flex-wrap:wrap}</style></head><body>
<nav><a href="/gis-workspace/">← GIS Workspace</a><a href="/mapa">GeoMoz Explorer</a><a href="/terms">Termos</a></nav>
<h1>Créditos e licenças de terceiros</h1>
<p>O GeoMoz GIS Workspace possui interface, navegação e integração de dados desenvolvidas para o GeoMoz. Alguns motores SIG e bibliotecas derivam de software de código aberto e continuam sujeitos às respectivas licenças.</p>
<article><h2>GeoLibre — motor GIS de código aberto</h2><p>Copyright © 2026 Qiusheng Wu. Licença MIT.</p>
<p>Parte da infraestrutura geoespacial é baseada no projecto <a href="https://github.com/opengeos/GeoLibre" rel="noopener noreferrer">GeoLibre</a>, adaptado e integrado no GeoMoz.</p>
<p><a href="/gis-workspace/GEOLIBRE-LICENSE.txt">Ler a licença MIT original</a> ·
<a href="/gis-workspace/GEOLIBRE-NOTICE.txt">Aviso de atribuição do motor</a></p></article>
<h2>Outras bibliotecas e provedores de dados</h2>
<p>MapLibre, ferramentas WebAssembly, dados públicos e serviços de mapas podem utilizar licenças e atribuições próprias. As atribuições cartográficas dos mapas e serviços utilizados devem continuar visíveis.</p>
<small>Esta página documenta dependências abertas. Não altera os termos GeoMoz nem concede direitos sobre marcas de terceiros.</small>
</body></html>`);
cpSync(license, resolve(destination, "GEOLIBRE-LICENSE.txt"));
writeFileSync(
  resolve(destination, "GEOLIBRE-NOTICE.txt"),
  "GeoLibre (c) 2026 Qiusheng Wu. MIT licensed.\nUpstream: https://github.com/opengeos/GeoLibre\nGeoMoz Workbench provides its own React interface on a pinned GeoLibre GIS engine.\nInterface source: scripts/assets/workbench in the GeoMoz repository.\nSee GEOLIBRE-LICENSE.txt for the license terms.\n"
);
console.log("GeoMoz Workbench prepared at " + destination);

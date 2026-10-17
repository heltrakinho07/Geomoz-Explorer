#!/usr/bin/env node
/**
 * Publish a pinned, unchanged GeoLibre web build as the GeoMoz GIS Workspace.
 * Original application code comes from opengeos/GeoLibre (MIT); only its
 * generated shell and deployment.json are adjusted for GeoMoz branding.
 *
 * Usage: node scripts/brand-geolibre-web.mjs <geolibre-dist> <geomoz-output> <geolibre-license>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, dereference: false });
const brandingCss = readFileSync(new URL("./assets/geolibre-geomoz-theme.css", import.meta.url), "utf8");
const cssVersion = createHash("sha256").update(brandingCss).digest("hex").slice(0, 12);
const themeHref = `<link rel="stylesheet" href="/gis-workspace/geomoz-brand.css?v=${cssVersion}" />`;
const backLink = '<a class="geomoz-back-link" href="/mapa" aria-label="Regressar ao GeoMoz" title="Regressar ao GeoMoz">← Voltar ao GeoMoz</a>';
const identityHead = [
  '<link rel="icon" type="image/svg+xml" href="/gis-workspace/favicon.svg" />',
  '<link rel="apple-touch-icon" href="/gis-workspace/apple-touch-icon.png" />',
  '<meta name="theme-color" content="#082f49" />',
  themeHref,
].join("\n  ");
let branded = html
  // Replace GeoLibre favicons, preserving all script and worker references.
  .replace(/<link\b[^>]*\brel=["'](?:icon|apple-touch-icon)["'][^>]*>/gi, "")
  .replace(/<meta\b[^>]*\bname=["']theme-color["'][^>]*>/gi, "")
  .replace(/<title>[^<]*<\/title>/i, "<title>GeoMoz GIS Workspace</title>")
  .replace("</head>", "  " + identityHead + "\n  </head>");
branded = branded.replace("</body>", "  " + backLink + "\n  </body>");
if (branded === html || !branded.includes(backLink) || !branded.includes(themeHref)) {
  throw new Error("Unable to brand the built GeoLibre HTML");
}
writeFileSync(resolve(destination, "index.html"), branded);
writeFileSync(
  resolve(destination, "deployment.json"),
  JSON.stringify(
    {
      version: 1,
      branding: { appName: "GeoMoz GIS Workspace", welcome: false },
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
    description: "Ambiente SIG profissional do GeoMoz, baseado no GeoLibre Web.",
    start_url: "/gis-workspace/",
    scope: "/gis-workspace/",
    theme_color: "#0284c7",
    background_color: "#020617",
  });
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}

cpSync(license, resolve(destination, "GEOLIBRE-LICENSE.txt"));
writeFileSync(
  resolve(destination, "GEOLIBRE-NOTICE.txt"),
  "GeoLibre (c) 2026 Qiusheng Wu. MIT licensed.\nUpstream: https://github.com/opengeos/GeoLibre\nGeoMoz reuses the original web application from a pinned upstream commit.\nSee GEOLIBRE-LICENSE.txt for the license terms.\n"
);
console.log("GeoLibre web application prepared at " + destination);

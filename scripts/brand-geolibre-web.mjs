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
const themeHref = '<link rel="stylesheet" href="/gis-workspace/geomoz-brand.css" />';
const backLink = '<a class="geomoz-back-link" href="/mapa" aria-label="Regressar ao GeoMoz" title="Regressar ao GeoMoz">← GeoMoz</a>';
let branded = html.replace("</head>", "  " + themeHref + "\n  </head>");
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
writeFileSync(
  resolve(destination, "geomoz-brand.css"),
  [
    "/* GeoMoz branding only. GeoLibre application UI and processing code remain upstream. */",
    ":root { --primary: 209 92% 43%; --ring: 209 92% 43%; }",
    ".dark { --primary: 204 97% 65%; --ring: 204 97% 65%; }",
    ".geomoz-back-link { position: fixed; right: 16px; bottom: 36px; z-index: 9999;",
    "  padding: 7px 11px; border: 1px solid #075985; border-radius: 8px;",
    "  color: white; background: #082f49; box-shadow: 0 2px 10px #0004;",
    "  font: 600 12px/1.4 system-ui, sans-serif; text-decoration: none; }",
    ".geomoz-back-link:hover, .geomoz-back-link:focus-visible { background: #075985; }",
    "@media (max-width: 600px) { .geomoz-back-link { right: 8px; bottom: 44px; padding: 6px 8px; } }",
    ""
  ].join("\n")
);
cpSync(license, resolve(destination, "GEOLIBRE-LICENSE.txt"));
writeFileSync(
  resolve(destination, "GEOLIBRE-NOTICE.txt"),
  "GeoLibre (c) 2026 Qiusheng Wu. MIT licensed.\nUpstream: https://github.com/opengeos/GeoLibre\nGeoMoz reuses the original web application from a pinned upstream commit.\nSee GEOLIBRE-LICENSE.txt for the license terms.\n"
);
console.log("GeoLibre web application prepared at " + destination);

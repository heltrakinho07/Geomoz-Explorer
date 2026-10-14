import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Google OAuth branding static public pages", () => {
  it("serves the privacy policy as crawlable HTML without relying on JavaScript", () => {
    const policy = read("public/privacy.html");
    expect(policy.length).toBeGreaterThan(5000);
    expect(policy).toContain('<html lang="pt-MZ">');
    expect(policy).toContain("<h1>Política de Privacidade</h1>");
    expect(policy).toContain("Google Earth Engine");
    expect(policy).toContain("tokens de acesso");
    expect(policy).toContain("Google API Services User Data Policy");
    expect(policy).toContain("https://myaccount.google.com/permissions");
    expect(policy).toContain("contacto@geolithica.com");
    expect(policy).toContain("Dados pessoais e geoespaciais");
    expect(policy).toContain('rel="canonical" href="https://geomoz.geolithica.com/privacy"');
    expect(policy).not.toContain('<div id="root"></div>');
    expect(policy).not.toContain('<script');
  });

  it("serves terms of service as a public stand-alone document", () => {
    const terms = read("public/terms.html");
    expect(terms.length).toBeGreaterThan(4000);
    expect(terms).toContain("<h1>Termos de Serviço</h1>");
    expect(terms).toContain("Google Cloud");
    expect(terms).toContain("GEOLÍTHICA");
    expect(terms).toContain('href="/privacy"');
    expect(terms).not.toContain("<script");
  });

  it("has a readable homepage identity and privacy link for non-JS crawlers", () => {
    const home = read("index.html");
    expect(home).toContain("GeoMoz Explorer");
    expect(home).toContain("Cartografia, Geoprocessamento");
    expect(home).toContain('href="/privacy"');
    expect(home).toContain('href="/terms"');
  });

  it("configures Firebase Hosting to resolve clean static HTML before the SPA fallback", () => {
    const config = JSON.parse(read("../../firebase.json"));
    expect(config.hosting.cleanUrls).toBe(true);
    expect(config.hosting.trailingSlash).toBe(false);
    expect(config.hosting.rewrites.at(-1).destination).toBe("/index.html");
  });
});

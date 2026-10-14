import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PrivacyPolicy, TermsOfService } from "../LegalPages";

describe("GeoMoz public legal pages", () => {
  it("renders a privacy policy with disclosures required for individual Google OAuth access", () => {
    const html = renderToStaticMarkup(<PrivacyPolicy />);
    expect(html).toContain("Política de Privacidade");
    expect(html).toContain("Google Earth Engine");
    expect(html).toContain("tokens");
    expect(html).toContain("revogar");
    expect(html).toContain("contacto@geolithica.com");
    expect(html).toContain("Google API Services User Data Policy");
    expect(html).toContain("https://myaccount.google.com/permissions");
    expect(html).toContain("<h1");
    expect(html).toContain("href=\"/\"");
  });

  it("renders public terms for personally authorised Earth Engine accounts", () => {
    const html = renderToStaticMarkup(<TermsOfService />);
    expect(html).toContain("Termos de Serviço");
    expect(html).toContain("Google Cloud");
    expect(html).toContain("responsável");
    expect(html).toContain("contacto@geolithica.com");
    expect(html).toContain("<h1");
    expect(html).not.toContain('href="/privacy"');
  });

  it("keeps both routes outside authentication and links only in the landing footer", () => {
    const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
    const landing = readFileSync(new URL("../LandingPage.tsx", import.meta.url), "utf8");
    expect(app).toContain('<Route path="/privacy">{() => <PrivacyPolicy />}</Route>');
    expect(app).toContain('<Route path="/terms">{() => <TermsOfService />}</Route>');
    expect(app.indexOf('path="/privacy"')).toBeLessThan(app.indexOf('path="/app"'));
    const footer = landing.slice(landing.indexOf("Comprehensive Bilingual Footer"));
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
    expect(landing.slice(0, landing.indexOf("Comprehensive Bilingual Footer"))).not.toContain('href="/privacy"');
    expect(landing.slice(0, landing.indexOf("Comprehensive Bilingual Footer"))).not.toContain('href="/terms"');
  });
});

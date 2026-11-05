import { describe, it, expect } from "vitest";
import { API_BASE, apiUrl, resolveApiBase } from "@/lib/api";

/**
 * NOTE: API_BASE is a module-level constant computed at import time.
 * Setting process.env.VITE_API_BASE or window.electronAPI in a test
 * has NO effect because the value is already cached. To properly test
 * the detection logic, API_BASE would need to be refactored into a
 * getApiBase() function. For now, these tests document the fallback
 * behavior in vitest's jsdom environment.
 */

describe("API_BASE", () => {
  it("defaults to empty string (relative URL) in vitest/jsdom", () => {
    // In vitest's jsdom environment, there's no import.meta.env.VITE_API_BASE
    // and no electronAPI, so the fallback is "" (relative URL for Vite proxy).
    expect(API_BASE).toBe("");
  });
});

describe("apiUrl", () => {
  it("prefixes the path with API_BASE", () => {
    expect(apiUrl("/geomoz-api/health")).toBe("/geomoz-api/health");
  });

  it("joins base with path correctly", () => {
    // Verify concatenation logic
    const result = apiUrl("/geomoz-api/stats");
    expect(result).toContain("/geomoz-api/");
  });
});

describe("GeoMoz production API routing", () => {
  const fallback = "https://geomoz-explorer-api-gay72ifazq-ew.a.run.app/";
  it.each([
    "geomoz.geolithica.com",
    "geoprocessamento-426809.web.app",
    "geoprocessamento-426809.firebaseapp.com",
  ])("always uses same-origin Firebase proxy on %s", (hostname) => {
    expect(resolveApiBase(hostname, fallback)).toBe("");
    expect(resolveApiBase(hostname, undefined)).toBe("");
  });

  it("keeps explicit endpoints for desktop and non-Hosting preview environments", () => {
    expect(resolveApiBase("localhost", fallback)).toBe(fallback.slice(0, -1));
    expect(resolveApiBase("localhost", undefined, true)).toBe("http://127.0.0.1:5003");
    expect(resolveApiBase("preview.example.com", undefined)).toBe("");
  });
});

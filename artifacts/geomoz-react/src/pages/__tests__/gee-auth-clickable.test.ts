import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Earth Engine connect buttons remain operable", () => {
  it("opens Google OAuth from the main Settings click, regardless of capability preflight", () => {
    const settings = read("src/components/SettingsDialog.tsx");
    expect(settings).toContain("onClick={handleConnectGee}");
    expect(settings).toContain("<span>Ligar com a Conta Google</span>");
    expect(settings).not.toContain(
      "onClick={oauthReady ? handleConnectGee : () => { void refreshStatus(); }}"
    );
    expect(settings).toContain("Voltar a verificar a API");
    expect(settings).toContain('href="https://code.earthengine.google.com/"');
    expect(settings).toContain('rel="noopener noreferrer"');
  });

  it("does not replace the Google connect action with API retry in the GEE dialog", () => {
    const dialog = read("src/components/GeeCredentialsDialog.tsx");
    expect(dialog).toContain("onClick={handleConnect}");
    expect(dialog).not.toContain(
      "onClick={oauthReady ? handleConnect : () => { void refreshStatus(); }}"
    );
  });

  it("uses token-based OAuth as an optional fallback when preflight is unavailable", () => {
    const hook = read("src/hooks/useGeeAuth.tsx");
    expect(hook).toContain("oauthCapabilities?.code_flow_ready");
    expect(hook).toContain("} else if (oauth.initTokenClient) {");
    expect(hook).not.toContain("if (!capabilities)");
    expect(hook).not.toContain("capabilities.token_flow_ready");
    expect(hook).toContain('"/geomoz-api/gee/oauth-token"');
  });
});

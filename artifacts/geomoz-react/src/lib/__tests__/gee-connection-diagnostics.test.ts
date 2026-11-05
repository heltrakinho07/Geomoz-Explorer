import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { diagnoseGeeApi } from "@/lib/gee-connection-diagnostics";

const mockedFetch = vi.mocked(apiFetch);
const reply = (status: number, data: Record<string, unknown>, mime = "application/json") => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => mime },
  json: async () => data,
}) as unknown as Response;

afterEach(() => {
  mockedFetch.mockReset();
});

describe("GeoMoz GEE retry diagnostics", () => {
  it("returns a visible instruction when GEE is not yet linked, even if the API works", async () => {
    mockedFetch
      .mockResolvedValueOnce(reply(200, { status: "ok" }))
      .mockResolvedValueOnce(reply(200, { code_flow_ready: false, token_flow_ready: true }))
      .mockResolvedValueOnce(reply(200, {
        connected: false, user_connected: false,
        message: "Inicie sessão e conecte a sua própria conta Earth Engine.",
      }));
    const result = await diagnoseGeeApi();
    expect(result.apiOnline).toBe(true);
    expect(result.connected).toBe(false);
    expect(result.message).toContain("Ligar com a Conta Google");
    expect(mockedFetch).toHaveBeenCalledTimes(3);
  });

  it("differentiates credential-store HTTP 503 from total network downtime", async () => {
    mockedFetch
      .mockResolvedValueOnce(reply(200, { status: "ok" }))
      .mockResolvedValueOnce(reply(200, { code_flow_ready: true }))
      .mockResolvedValueOnce(reply(503, { detail: "Firestore sem permissão" }));
    const result = await diagnoseGeeApi();
    expect(result.apiOnline).toBe(true);
    expect(result.message).toContain("HTTP 503");
    expect(result.message).toContain("Firestore");
  });

  it("explains when a signed-in Firebase session cannot authorize capabilities", async () => {
    mockedFetch
      .mockResolvedValueOnce(reply(200, { status: "ok" }))
      .mockResolvedValueOnce(reply(401, { detail: "Autenticação Firebase necessária." }));
    const result = await diagnoseGeeApi();
    expect(result.apiOnline).toBe(true);
    expect(result.message).toContain("sessão Firebase");
  });

  it("rejects accidental Hosting SPA fallback instead of treating HTML as API JSON", async () => {
    mockedFetch.mockResolvedValueOnce(reply(200, {}, "text/html"));
    const result = await diagnoseGeeApi();
    expect(result.apiOnline).toBe(false);
    expect(result.message).toContain("página em vez da API JSON");
    expect(result.message).toContain("Firebase Hosting");
  });

  it("returns a visible message when requests fail before a response arrives", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Serviço indisponível"));
    const result = await diagnoseGeeApi();
    expect(result.apiOnline).toBe(false);
    expect(result.message).toContain("Serviço indisponível");
  });

  it("reports a verified personal connection", async () => {
    mockedFetch
      .mockResolvedValueOnce(reply(200, { status: "ok" }))
      .mockResolvedValueOnce(reply(200, { code_flow_ready: true }))
      .mockResolvedValueOnce(reply(200, {
        connected: true, user_connected: true, project: "geoprocessamento-426809",
      }));
    const result = await diagnoseGeeApi();
    expect(result.connected).toBe(true);
    expect(result.message).toContain("geoprocessamento-426809");
  });
});

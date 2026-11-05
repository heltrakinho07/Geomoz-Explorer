import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI_DIAGNOSTIC_MESSAGES, aiDiagnosticText, agentHttpError, localizedAgentWarning } from "./aiDiagnostics";

const agent = readFileSync(resolve(process.cwd(), "src/components/GeoMozAIAgentTab.tsx"), "utf8");
const dossier = readFileSync(resolve(process.cwd(), "src/components/GeoIntelligenceDossier.tsx"), "utf8");

describe("GeoMoz AI technical errors and dossier locale", () => {
  it("provides PT/EN/ES/FR and falls back to English", () => {
    expect(Object.keys(AI_DIAGNOSTIC_MESSAGES).length).toBeGreaterThanOrEqual(59);
    for (const [key, translations] of Object.entries(AI_DIAGNOSTIC_MESSAGES)) {
      expect(translations, key).toHaveLength(4);
      for (const translation of translations) expect(translation.trim(), key).not.toBe("");
    }
    expect(aiDiagnosticText("en", "dossier.status.partial")).toBe("Partial results");
    expect(aiDiagnosticText("es", "agent.pdfDate")).toBe("Fecha:");
    expect(aiDiagnosticText("fr", "error.aborted")).toContain("75 secondes");
    expect(aiDiagnosticText("pt-MZ", "error.requestId")).toBe("Código de diagnóstico:");
    expect(aiDiagnosticText("de", "error.models")).toBe("Could not retrieve the models.");
  });

  it("maps API codes and HTTP statuses without exposing arbitrary server text", () => {
    const privateText = "private-key=DO_NOT_EXPOSE";
    const message = agentHttpError("en", 500, { message: privateText, request_id: "req_88abc" });
    expect(message).toContain("HTTP 500");
    expect(message).toContain("req_88abc");
    expect(message).not.toContain(privateText);
    expect(agentHttpError("es", 429, privateText)).toContain("límite de solicitudes");
    expect(agentHttpError("fr", 401, privateText)).toContain("Reconnectez-vous");
    expect(agentHttpError("en", 403, null)).toContain("permission");
    expect(agentHttpError("en", 503, { code: "gee_reconnect_required" })).toContain("Google Earth Engine");
    expect(agentHttpError("pt", 400, { request_id: "<script>" })).not.toContain("<script>");
  });

  it("translates only stable warnings while preserving unknown scientific limitations", () => {
    expect(localizedAgentWarning("en", "Há ferramentas sem resultado; a síntese não valida os indicadores em falta."))
      .toContain("missing indicators");
    expect(localizedAgentWarning("fr", "Favorabilidade é um modelo exploratório. A designação AHP exige matriz de comparação e razão de consistência verificadas."))
      .toContain("AHP");
    const raw = "Soil moisture error: 0.0000001 with station ID 17";
    expect(localizedAgentWarning("es", raw)).toBe(raw);
  });

  it("keeps original evidence and API contracts, and passes the preferred locale to the backend", () => {
    expect(agent).toContain("uiLocale: translatedLocale");
    expect(agent).toContain("agentHttpError(translatedLocale");
    expect(agent).toContain('diag("error.aborted")');
    expect(agent).toContain('diag("agent.pdfTitle")');
    expect(agent).toContain("current_map_state: currentMapState");
    expect(agent).toContain("/geomoz-api/ai/agent-chat");
    expect(dossier).toContain("JSON.stringify(dossier, null, 2)");
    expect(dossier).toContain("localizedAgentWarning(translatedLocale, text)");
    expect(dossier).toContain('t("dossier.export")');
    expect(dossier).toContain("JSON.stringify({ parametros: record.parameters, resultado: record.result }, null, 2)");
  });
});

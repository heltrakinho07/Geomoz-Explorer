import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI_AGENT_MESSAGES, aiAgentText } from "./aiAgent";

describe("GeoMoz AI Agent chat translations", () => {
  it("includes reviewed four-language strings and English fallback", () => {
    expect(Object.keys(AI_AGENT_MESSAGES).length).toBeGreaterThanOrEqual(40);
    for (const [key, labels] of Object.entries(AI_AGENT_MESSAGES)) {
      expect(labels, key).toHaveLength(4);
      labels.forEach(label => expect(label.trim(), key).not.toBe(""));
    }
    expect(aiAgentText("en", "chat.heading")).toBe("What would you like to analyse?");
    expect(aiAgentText("es", "settings.model")).toBe("Modelo compatible");
    expect(aiAgentText("fr", "chat.send")).toBe("Envoyer le message");
    expect(aiAgentText("pt-MZ", "chat.placeholder")).toBe("Descreva a análise que pretende…");
    expect(aiAgentText("de", "chat.send")).toBe("Send message");
  });

  it("keeps stable AI request paths, field names and original analytical geometry", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/GeoMozAIAgentTab.tsx"), "utf8");
    for (const literal of [
      "/geomoz-api/ai/agent-chat",
      "current_map_state",
      "list_administrative_units",
      "loadGAULUnits",
      "PublicDataTools",
      "handlePromptSubmit",
      "GeoAgentMarkdown",
      'copy("chat.placeholder")',
      'copy("chat.advanced")',
      'copy("settings.heading")',
      'copy("chat.exampleGeology")',
    ]) expect(source, literal).toContain(literal);
    expect(source).toContain("usePortalTranslation()");
  });
});

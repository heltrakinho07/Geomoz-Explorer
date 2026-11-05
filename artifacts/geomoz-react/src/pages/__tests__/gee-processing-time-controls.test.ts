import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analysisControlText } from "../../i18n/analysisControls";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/GeoAnalises.tsx"),
  "utf8"
);

describe("GeoAnálises processing-time management", () => {
  it("lets users select real Earth Engine statistics depth", () => {
    expect(source).toContain('useState<"fast" | "balanced" | "detailed">("fast")');
    expect(source).toContain("processing_mode: processingMode");
    expect(source).toContain("analysisT('gee.mode.fast')");
    expect(analysisControlText("pt", "gee.mode.fast")).toBe("Rápido — mapa primeiro");
    expect(source).toContain("analysisT('gee.mode.balanced')");
    expect(analysisControlText("pt", "gee.mode.balanced")).toBe("Equilibrado — estatísticas básicas");
    expect(source).toContain("analysisT('gee.mode.detailed')");
    expect(analysisControlText("pt", "gee.mode.detailed")).toBe("Detalhado — percentis e análise completa");
  });

  it("gives an elapsed clock and adjustable timeout instead of invented progress", () => {
    expect(source).toContain("setProcessingElapsed(Math.floor((Date.now() - start) / 1000))");
    expect(source).toContain("value={processingTimeLimit}");
    expect(source).toContain('analysisT("run.progressHint")');
    expect(analysisControlText("pt", "run.progressHint")).toContain("Tempo decorrido real");
    expect(source).toContain("clearTimeout(timeout)");
    expect(source).toContain("role=\"status\"");
  });

  it("supports cancelling browser requests without promising server-side cancellation", () => {
    expect(source).toContain("const cancelActiveProcessing = () =>");
    expect(source).toContain('abortReasonRef.current = "manual"');
    expect(source).toContain("controller.abort()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("A computação já iniciada no Earth Engine pode continuar no servidor.");
    expect(source).toContain('analysisT("run.cancelWait")');
    expect(analysisControlText("pt", "run.cancelWait")).toBe("Cancelar espera");
  });
});

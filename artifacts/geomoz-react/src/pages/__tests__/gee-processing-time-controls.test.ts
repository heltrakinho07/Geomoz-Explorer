import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/GeoAnalises.tsx"),
  "utf8"
);

describe("GeoAnálises processing-time management", () => {
  it("lets users select real Earth Engine statistics depth", () => {
    expect(source).toContain('useState<"fast" | "balanced" | "detailed">("fast")');
    expect(source).toContain("processing_mode: processingMode");
    expect(source).toContain("Rápido — mapa primeiro");
    expect(source).toContain("Equilibrado — estatísticas básicas");
    expect(source).toContain("Detalhado — percentis e análise completa");
  });

  it("gives an elapsed clock and adjustable timeout instead of invented progress", () => {
    expect(source).toContain("setProcessingElapsed(Math.floor((Date.now() - start) / 1000))");
    expect(source).toContain("value={processingTimeLimit}");
    expect(source).toContain("Tempo decorrido real");
    expect(source).toContain("clearTimeout(timeout)");
    expect(source).toContain("role=\"status\"");
  });

  it("supports cancelling browser requests without promising server-side cancellation", () => {
    expect(source).toContain("const cancelActiveProcessing = () =>");
    expect(source).toContain('abortReasonRef.current = "manual"');
    expect(source).toContain("controller.abort()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("A computação já iniciada no Earth Engine pode continuar no servidor.");
    expect(source).toContain("Cancelar espera");
  });
});

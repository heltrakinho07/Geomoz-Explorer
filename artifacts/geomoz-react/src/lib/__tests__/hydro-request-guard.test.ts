import { describe, expect, it } from "vitest";
import { HydroRequestGuard } from "../hydro-request-guard";

describe("HydroRequestGuard", () => {
  it("cancels an active river request and rejects its late result", () => {
    const guard = new HydroRequestGuard();
    const first = guard.start();
    expect(guard.isCurrent(first)).toBe(true);
    expect(guard.cancel()).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.finish(first)).toBe(false);
    expect(guard.cancel()).toBe(false);
  });

  it("prevents a previous basin request from overwriting a newer one", () => {
    const guard = new HydroRequestGuard();
    const previous = guard.start();
    const current = guard.start();
    expect(previous.signal.aborted).toBe(true);
    expect(guard.isCurrent(previous)).toBe(false);
    expect(guard.finish(previous)).toBe(false);
    expect(guard.isCurrent(current)).toBe(true);
    expect(guard.finish(current)).toBe(true);
    expect(guard.isCurrent(current)).toBe(false);
  });
});

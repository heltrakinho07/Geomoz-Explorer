import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import { runGISVectorCommand } from "../gis-vector-runner";

const fc: FeatureCollection = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [32.6, -25.9] } }],
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown = null;

  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: unknown) { this.posted = message; }
  terminate() { this.terminated = true; }
}

describe("GIS vector runner cancellation", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("ignores late success after cancellation and finishes exactly once", async () => {
    const controller = new AbortController();
    const state = vi.fn();
    const run = runGISVectorCommand("vector_centroids", fc, {}, undefined, { signal: controller.signal, onStateChange: state });
    const worker = FakeWorker.instances[0];
    controller.abort();
    worker.onmessage?.({ data: { id: (worker.posted as { id: string }).id, status: "success", response: { result: fc } } } as MessageEvent);
    await expect(run).rejects.toThrow("cancelada");
    expect(state.mock.calls).toEqual([["running"], ["finished"]]);
  });

  it("terminates a timed-out job and ignores unrelated response IDs", async () => {
    vi.useFakeTimers();
    const run = runGISVectorCommand("vector_centroids", fc, {}, undefined, { timeoutMs: 1000 });
    const failure = expect(run).rejects.toThrow(/limite de tempo/);
    const worker = FakeWorker.instances[0];
    worker.onmessage?.({ data: { id: "another-job", status: "success", response: { result: fc } } } as MessageEvent);
    await vi.advanceTimersByTimeAsync(1000);
    await failure;
    expect(worker.terminated).toBe(true);
  });

  it("rejects pre-aborted tasks without constructing a worker", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runGISVectorCommand("vector_centroids", fc, {}, undefined, { signal: controller.signal })
    ).rejects.toThrow("cancelada");
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("terminates a running worker and rejects the cancelled task", async () => {
    const controller = new AbortController();
    const states: string[] = [];
    const run = runGISVectorCommand("vector_centroids", fc, {}, undefined, {
      signal: controller.signal,
      onStateChange: (state) => states.push(state),
    });
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].posted).toMatchObject({ tool: "vector_centroids" });
    controller.abort();
    await expect(run).rejects.toThrow("cancelada");
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(states).toEqual(["running", "finished"]);
  });

  it("rejects an execution error and terminates the worker", async () => {
    const run = runGISVectorCommand("vector_difference", fc);
    const worker = FakeWorker.instances[0];
    const posted = worker.posted as { id: string };
    worker.onmessage?.({ data: { id: posted.id, status: "error", error: "Polígono inválido" } } as MessageEvent);
    await expect(run).rejects.toThrow("Polígono inválido");
    expect(worker.terminated).toBe(true);
  });
});

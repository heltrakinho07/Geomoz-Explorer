import { describe, expect, it } from "vitest";
import { createLastWriteWinsQueue } from "../gis-workspace-sync-queue";

describe("GIS workspace cloud sync queue", () => {
  it("runs cloud writes serially and never overwrites the latest snapshot", async () => {
    const completed: number[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const queue = createLastWriteWinsQueue(async (version: number) => {
      if (version === 1) await firstBlocked;
      completed.push(version);
    });
    const a = queue.enqueue(1);
    const b = queue.enqueue(2);
    const c = queue.enqueue(3);
    releaseFirst();
    await Promise.all([a, b, c]);
    expect(completed).toEqual([1, 3]);
  });

  it("reports a failed upload and retries the next snapshot", async () => {
    let attempt = 0;
    const queue = createLastWriteWinsQueue(async (value: number) => {
      attempt++;
      if (value === 1) throw new Error("storage denied");
    });
    await expect(queue.enqueue(1)).rejects.toThrow("storage denied");
    await expect(queue.enqueue(2)).resolves.toBeUndefined();
    expect(attempt).toBe(2);
  });
});

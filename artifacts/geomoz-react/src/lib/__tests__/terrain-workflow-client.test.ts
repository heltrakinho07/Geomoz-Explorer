// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBoundedDem, runTerrainWorkflow } from '../terrain-workflow-client';
import { DEFAULT_TERRAIN_OPTIONS, MAX_DEM_BYTES } from '../terrain-workflow';
class TestWorker {
  static last: TestWorker;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { TestWorker.last = this; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('terrain worker lifecycle and bounded downloads', () => {
  it('reads a DEM and rejects HTTP errors and oversized streams', async () => {
    const signal = new AbortController().signal;
    expect(await readBoundedDem(new Response(new Uint8Array([1,2,3])), signal)).toEqual(new Uint8Array([1,2,3]));
    await expect(readBoundedDem(new Response('', {status: 403}), signal)).rejects.toThrow('403');
    await expect(readBoundedDem(new Response('', {headers: {'content-length': String(MAX_DEM_BYTES + 1)}}), signal)).rejects.toThrow('64 MiB');
    await expect(readBoundedDem(new Response(new Uint8Array(MAX_DEM_BYTES + 1)), signal)).rejects.toThrow('64 MiB');
  });
  it('terminates computation when cancelled', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const controller = new AbortController();
    const task = runTerrainWorkflow(new Uint8Array([1]), 'dem.tif', DEFAULT_TERRAIN_OPTIONS, controller.signal, vi.fn());
    controller.abort();
    await expect(task).rejects.toMatchObject({name: 'AbortError'});
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it('forwards progress and disposes the worker after a result or timeout', async () => {
    vi.stubGlobal('Worker', TestWorker); vi.useFakeTimers();
    const progress = vi.fn();
    const task = runTerrainWorkflow(new Uint8Array([1]), 'dem.tif', DEFAULT_TERRAIN_OPTIONS, new AbortController().signal, progress);
    TestWorker.last.onmessage!({data: {kind: 'progress', progress: {completed: 1}}});
    TestWorker.last.onmessage!({data: {kind: 'result', result: {products: []}}});
    await expect(task).resolves.toEqual({products: []});
    expect(progress).toHaveBeenCalledWith({completed: 1});
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
    const timed = runTerrainWorkflow(new Uint8Array([1]), 'dem.tif', DEFAULT_TERRAIN_OPTIONS, new AbortController().signal, vi.fn());
    const assertion = expect(timed).rejects.toThrow('5 minutos');
    await vi.advanceTimersByTimeAsync(300000); await assertion;
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
  });
});

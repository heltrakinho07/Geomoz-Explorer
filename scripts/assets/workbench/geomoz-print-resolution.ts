/** Increase the renderer's drawing buffer without changing its geographic camera. */
export interface PrintMap {
  getPixelRatio(): number;
  setPixelRatio(ratio: number): void;
  getCanvas(): { clientWidth: number; clientHeight: number };
  loaded(): boolean;
  on(event: 'idle', callback: () => void): unknown;
  off(event: 'idle', callback: () => void): unknown;
  triggerRepaint(): void;
}
const pending = new WeakMap<object, Promise<unknown>>();
export function printPixelRatio(width: number, height: number, current: number): number {
  if (!(width > 0 && height > 0 && current > 0)) throw new Error('Dimensões de mapa inválidas');
  // Bound memory and WebGL dimensions; never reduce an existing buffer.
  return Math.max(current, Math.min(4, 4800 / Math.max(width, height), Math.sqrt(16000000 / (width * height))));
}
async function idle(map: PrintMap): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const done = () => { clearTimeout(timer); map.off('idle', done); resolve(); };
    const timer = setTimeout(() => { map.off('idle', done); reject(new Error('O mapa não terminou de carregar para impressão.')); }, 20000);
    map.on('idle', done);
    map.triggerRepaint();
  });
}
export function withPrintResolution<T>(map: PrintMap, capture: () => Promise<T>): Promise<T> {
  // Serialize captures so one request cannot restore another request's buffer.
  const previous = pending.get(map) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const original = map.getPixelRatio();
    const canvas = map.getCanvas();
    const ratio = printPixelRatio(canvas.clientWidth, canvas.clientHeight, original);
    try {
      map.setPixelRatio(ratio);
      await idle(map);
      return await capture();
    } finally {
      map.setPixelRatio(original);
      map.triggerRepaint();
    }
  });
  pending.set(map, task);
  void task.finally(() => { if (pending.get(map) === task) pending.delete(map); }).catch(() => {});
  return task;
}

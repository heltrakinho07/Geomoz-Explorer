/**
 * Prevents overlapping Firestore/Storage workspace writes. A slow upload must
 * not finish after a newer snapshot and silently restore removed layers.
 * Pending autosaves are coalesced; all waiting callers observe the final write.
 */
export function createLastWriteWinsQueue<T>(
  write: (value: T) => Promise<void>,
  keyOf: (value: T) => string = () => "default",
) {
  type Waiter = { resolve: () => void; reject: (cause: unknown) => void };
  let running = false;
  const pending = new Map<string, { value: T; waiters: Waiter[] }>();

  const drain = async () => {
    if (running) return;
    running = true;
    while (pending.size) {
      const key = pending.keys().next().value!;
      const batch = pending.get(key)!;
      pending.delete(key);
      try {
        await write(batch.value);
        batch.waiters.forEach(({ resolve }) => resolve());
      } catch (cause) {
        batch.waiters.forEach(({ reject }) => reject(cause));
      }
    }
    running = false;
  };

  return {
    enqueue(value: T): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const key = keyOf(value);
        const batch = pending.get(key);
        if (batch) {
          batch.value = value;
          batch.waiters.push({ resolve, reject });
        } else {
          pending.set(key, { value, waiters: [{ resolve, reject }] });
        }
        void drain();
      });
    },
  };
}

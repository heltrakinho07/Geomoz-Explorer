/**
 * Prevents overlapping Firestore/Storage workspace writes. A slow upload must
 * not finish after a newer snapshot and silently restore removed layers.
 * Pending autosaves are coalesced; all waiting callers observe the final write.
 */
export function createLastWriteWinsQueue<T>(write: (value: T) => Promise<void>) {
  type Waiter = { resolve: () => void; reject: (cause: unknown) => void };
  let running = false;
  let pending: { value: T; waiters: Waiter[] } | null = null;

  const drain = async () => {
    if (running) return;
    running = true;
    while (pending) {
      const batch = pending;
      pending = null;
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
        if (pending) {
          pending.value = value;
          pending.waiters.push({ resolve, reject });
        } else {
          pending = { value, waiters: [{ resolve, reject }] };
        }
        void drain();
      });
    },
  };
}

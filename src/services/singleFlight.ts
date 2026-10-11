/** Coalesce equal asynchronous reads while they are pending, without caching results. */
export function createSingleFlight() {
  const pending = new Map<string, Promise<unknown>>();

  const run = <T,>(key: string, read: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;

    let request: Promise<T>;
    try {
      request = Promise.resolve(read());
    } catch (error) {
      request = Promise.reject(error);
    }
    pending.set(key, request);
    const clearIfCurrent = () => {
      if (pending.get(key) === request) pending.delete(key);
    };
    void request.then(clearIfCurrent, clearIfCurrent);
    return request;
  };

  const invalidate = (matches: (key: string) => boolean) => {
    for (const key of pending.keys()) {
      if (matches(key)) pending.delete(key);
    }
  };

  return { run, invalidate };
}

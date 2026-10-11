import { describe, expect, it, vi } from 'vitest';
import { createSingleFlight } from './singleFlight';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('createSingleFlight', () => {
  it('shares one pending read for the same key and does not cache its result', async () => {
    const reads = createSingleFlight();
    const pending = deferred<string[]>();
    const read = vi.fn(() => pending.promise);

    const first = reads.run('rides', read);
    const second = reads.run('rides', read);

    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    pending.resolve(['ride-1']);
    await expect(first).resolves.toEqual(['ride-1']);

    await expect(reads.run('rides', async () => ['ride-2'])).resolves.toEqual(['ride-2']);
  });

  it('keeps different read keys independent', async () => {
    const reads = createSingleFlight();
    const readA = vi.fn(async () => 'A');
    const readB = vi.fn(async () => 'B');

    await expect(Promise.all([
      reads.run('session:a', readA),
      reads.run('session:b', readB),
    ])).resolves.toEqual(['A', 'B']);
    expect(readA).toHaveBeenCalledTimes(1);
    expect(readB).toHaveBeenCalledTimes(1);
  });

  it('clears failed reads so a later request can retry', async () => {
    const reads = createSingleFlight();
    const error = new Error('database unavailable');

    await expect(reads.run('session:a', async () => { throw error; })).rejects.toBe(error);
    await expect(reads.run('session:a', async () => 'recovered')).resolves.toBe('recovered');
  });

  it('does not let an invalidated older read clear its replacement', async () => {
    const reads = createSingleFlight();
    const oldRead = deferred<string>();
    const currentRead = deferred<string>();
    const oldRequest = reads.run('session:a', () => oldRead.promise);

    reads.invalidate((key) => key === 'session:a');
    const currentRequest = reads.run('session:a', () => currentRead.promise);
    oldRead.resolve('old');
    await expect(oldRequest).resolves.toBe('old');

    expect(reads.run('session:a', () => Promise.resolve('unexpected'))).toBe(currentRequest);
    currentRead.resolve('current');
    await expect(currentRequest).resolves.toBe('current');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baselineEnv = { ...import.meta.env };
const runtimeEnv = import.meta.env as Record<string, string | boolean | undefined>;

describe('realtime service', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.assign(runtimeEnv, baselineEnv);
  });

  afterEach(() => {
    Object.assign(runtimeEnv, baselineEnv);
  });

  it('does not initialize Echo when no pusher key is provided', async () => {
    runtimeEnv.VITE_PUSHER_KEY = undefined;
    runtimeEnv.VITE_ENABLE_REALTIME = undefined;

    const { getEcho } = await import('./realtime');

    expect(getEcho()).toBeNull();
  });

  it('does not initialize Echo when realtime is explicitly disabled', async () => {
    runtimeEnv.VITE_PUSHER_KEY = 'demo-key';
    runtimeEnv.VITE_ENABLE_REALTIME = 'false';

    const { getEcho } = await import('./realtime');

    expect(getEcho()).toBeNull();
  });
});

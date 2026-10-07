import { describe, expect, it } from 'vitest';
import {
  classifyLocationOutboxFailure,
  isLocationBatchSyncEnabled,
  locationOutboxRetryDelayMs,
} from './locationOutboxPolicy';

describe('location outbox failure policy', () => {
  it('keeps batch synchronization disabled unless explicitly enabled', () => {
    expect(isLocationBatchSyncEnabled()).toBe(false);
    expect(isLocationBatchSyncEnabled('false')).toBe(false);
    expect(isLocationBatchSyncEnabled('true')).toBe(true);
  });

  it.each([undefined, 408, 429, 500, 503])('retries status %s', (status) => {
    expect(classifyLocationOutboxFailure(status)).toBe('retry');
  });

  it.each([401, 403])('pauses status %s for authentication', (status) => {
    expect(classifyLocationOutboxFailure(status)).toBe('authentication-required');
  });

  it.each([400, 404, 409, 422])('permanently rejects status %s', (status) => {
    expect(classifyLocationOutboxFailure(status)).toBe('permanent-failure');
  });

  it('uses five-second exponential backoff, bounded jitter, and a five-minute cap', () => {
    expect(locationOutboxRetryDelayMs(0, () => 0)).toBe(5000);
    expect(locationOutboxRetryDelayMs(0, () => 1)).toBe(6000);
    expect(locationOutboxRetryDelayMs(1, () => 0)).toBe(10_000);
    expect(locationOutboxRetryDelayMs(20, () => 1)).toBe(300_000);
  });
});

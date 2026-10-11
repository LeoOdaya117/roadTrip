export type LocationOutboxFailureAction =
  | 'retry'
  | 'authentication-required'
  | 'permanent-failure';

export const isLocationBatchSyncEnabled = (value?: string) => value === 'true';

export const classifyLocationOutboxFailure = (
  status?: number,
): LocationOutboxFailureAction => {
  if (status === undefined || status === 408 || status === 429 || status >= 500) {
    return 'retry';
  }
  if (status === 401 || status === 403) return 'authentication-required';
  return 'permanent-failure';
};

export const locationOutboxRetryDelayMs = (
  attempt: number,
  random = Math.random,
) => {
  const base = Math.min(300_000, 5000 * 2 ** Math.max(0, attempt));
  const jitter = base * 0.2 * Math.min(1, Math.max(0, random()));
  return Math.min(300_000, Math.round(base + jitter));
};

import { createBrowserHistory } from 'history';
import type { Action, History as RouterHistory, LocationListener } from 'history';

const HISTORY_INDEX_KEY = '__roadTripHistoryIndex';
const HISTORY_HIGH_WATER_KEY = '__roadTripHistoryHighWatermark';

const readHistoryHighWatermark = () => {
  try {
    const value = Number(window.sessionStorage.getItem(HISTORY_HIGH_WATER_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : -1;
  } catch {
    return -1;
  }
};

const persistHistoryHighWatermark = (index: number) => {
  try {
    const highWatermark = Math.max(index, readHistoryHighWatermark());
    window.sessionStorage.setItem(HISTORY_HIGH_WATER_KEY, String(highWatermark));
  } catch {
    // Browser history state still tracks this document if session storage is unavailable.
  }
};

export const getInitialBrowserHistoryIndex = (
  existingIndex: number | undefined,
  highWatermark: number,
) => existingIndex ?? Math.max(0, highWatermark + 1);

const getHistoryIndex = (state: unknown): number | undefined => {
  if (!state || typeof state !== 'object') return undefined;
  const index = (state as Record<string, unknown>)[HISTORY_INDEX_KEY];
  return typeof index === 'number' && Number.isSafeInteger(index) ? index : undefined;
};

const withHistoryIndex = (state: unknown, index: number) => ({
  ...(state && typeof state === 'object' ? state as Record<string, unknown> : {}),
  [HISTORY_INDEX_KEY]: index,
});

/**
 * Tracks browser history entries so Ionic can distinguish a Forward POP from
 * a Back POP. Ionic's route stack treats both browser actions as POP, but a
 * forward entry needs a fresh push relationship after the prior Back removed
 * it from Ionic's private view stack.
 */
export class BrowserHistoryDirectionTracker {
  private currentIndex: number;
  private readonly indexesByKey = new Map<string, number>();

  constructor(currentIndex: number, currentKey?: string) {
    this.currentIndex = currentIndex;
    if (currentKey) this.indexesByKey.set(currentKey, currentIndex);
  }

  getNextPushIndex() {
    return this.currentIndex + 1;
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  observe(locationKey: string | undefined, action: Action, persistedIndex?: number): Action {
    if (action === 'PUSH') {
      for (const [key, index] of this.indexesByKey) {
        if (index > this.currentIndex) this.indexesByKey.delete(key);
      }
      this.currentIndex = persistedIndex ?? this.currentIndex + 1;
      if (locationKey) this.indexesByKey.set(locationKey, this.currentIndex);
      return action;
    }

    if (action === 'REPLACE') {
      this.currentIndex = persistedIndex ?? this.currentIndex;
      for (const [key, index] of this.indexesByKey) {
        if (index === this.currentIndex) this.indexesByKey.delete(key);
      }
      if (locationKey) this.indexesByKey.set(locationKey, this.currentIndex);
      return action;
    }

    const knownIndex = persistedIndex ?? (locationKey ? this.indexesByKey.get(locationKey) : undefined);
    // Legacy entries without our marker are treated as the preceding entry.
    // Once the browser returns to a marked entry, its persisted index restores
    // the cursor and lets us classify Forward correctly.
    const targetIndex = knownIndex ?? this.currentIndex - 1;
    const nextAction = targetIndex > this.currentIndex ? 'PUSH' : 'POP';
    this.currentIndex = targetIndex;
    if (locationKey) this.indexesByKey.set(locationKey, targetIndex);
    return nextAction;
  }
}

/**
 * Creates the browser history instance used by IonReactRouter and annotates
 * its native entries with a small cursor. The URL and browser history stack
 * remain under the browser's control; only Ionic's notification for a known
 * forward POP is reported as PUSH so its outlet can restore that page.
 */
export const createIonicBrowserHistory = (): RouterHistory => {
  const history = createBrowserHistory();
  const nativeHistory = window.history;
  const existingIndex = getHistoryIndex(nativeHistory.state);
  const currentIndex = getInitialBrowserHistoryIndex(existingIndex, readHistoryHighWatermark());
  persistHistoryHighWatermark(currentIndex);

  if (existingIndex === undefined) {
    nativeHistory.replaceState(
      withHistoryIndex(nativeHistory.state, currentIndex),
      '',
      window.location.href,
    );
  }

  const tracker = new BrowserHistoryDirectionTracker(currentIndex, history.location.key);
  const listeners = new Set<LocationListener>();
  const originalListen = history.listen.bind(history);

  originalListen((location, action) => {
    const nextAction = tracker.observe(
      location.key,
      action,
      getHistoryIndex(nativeHistory.state),
    );
    persistHistoryHighWatermark(tracker.getCurrentIndex());
    if (action === 'POP' && nextAction === 'PUSH') {
      window.dispatchEvent(new CustomEvent('roadtrip:history-forward', {
        detail: { path: `${location.pathname}${location.search}${location.hash}` },
      }));
    }
    listeners.forEach((listener) => listener(location, nextAction));
  });

  history.listen = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const withIndexedNativeWrite = (
    method: 'pushState' | 'replaceState',
    index: number,
    write: () => void,
  ) => {
    const methods = nativeHistory as unknown as Record<'pushState' | 'replaceState', typeof nativeHistory.pushState>;
    const originalWrite = methods[method];
    const indexedWrite = ((state: unknown, title: string, url?: string | URL | null) => (
      originalWrite.call(nativeHistory, withHistoryIndex(state, index), title, url)
    )) as typeof nativeHistory.pushState;

    methods[method] = indexedWrite;
    try {
      write();
    } finally {
      if (methods[method] === indexedWrite) methods[method] = originalWrite;
    }
  };

  const originalPush = history.push.bind(history);
  history.push = (path, state) => {
    withIndexedNativeWrite('pushState', tracker.getNextPushIndex(), () => originalPush(path, state));
  };

  const originalReplace = history.replace.bind(history);
  history.replace = (path, state) => {
    withIndexedNativeWrite('replaceState', currentIndexForReplace(), () => originalReplace(path, state));
  };

  function currentIndexForReplace() {
    return getHistoryIndex(nativeHistory.state) ?? tracker.getCurrentIndex();
  }

  return history;
};

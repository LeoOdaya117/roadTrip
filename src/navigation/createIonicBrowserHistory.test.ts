import { describe, expect, it } from 'vitest';
import {
  BrowserHistoryDirectionTracker,
  getInitialBrowserHistoryIndex,
} from './createIonicBrowserHistory';

describe('BrowserHistoryDirectionTracker', () => {
  it('keeps Back as POP and reports a known Forward entry as PUSH', () => {
    const tracker = new BrowserHistoryDirectionTracker(0, 'home');

    expect(tracker.getNextPushIndex()).toBe(1);
    expect(tracker.observe('lobby', 'PUSH', 1)).toBe('PUSH');
    expect(tracker.observe('home', 'POP', 0)).toBe('POP');
    expect(tracker.observe('lobby', 'POP', 1)).toBe('PUSH');
  });

  it('keeps replacements at the current entry and drops discarded forward entries after a new push', () => {
    const tracker = new BrowserHistoryDirectionTracker(0, 'home');
    tracker.observe('lobby', 'PUSH', 1);
    tracker.observe('home', 'POP', 0);

    expect(tracker.observe('home-replaced', 'REPLACE', 0)).toBe('REPLACE');
    expect(tracker.getNextPushIndex()).toBe(1);
    tracker.observe('account', 'PUSH', 1);
    expect(tracker.observe('home-replaced', 'POP', 0)).toBe('POP');
    expect(tracker.getNextPushIndex()).toBe(1);
  });

  it('recovers Forward direction after returning through a legacy unmarked entry', () => {
    const tracker = new BrowserHistoryDirectionTracker(0, 'current');

    expect(tracker.observe('legacy', 'POP')).toBe('POP');
    expect(tracker.observe('current', 'POP', 0)).toBe('PUSH');
  });

  it('assigns a monotonic index to a new document so Back cannot look like Forward', () => {
    const currentDocumentIndex = getInitialBrowserHistoryIndex(undefined, 7);
    const tracker = new BrowserHistoryDirectionTracker(currentDocumentIndex, 'new-home');

    expect(currentDocumentIndex).toBe(8);
    expect(tracker.observe('previous-entry', 'POP', 7)).toBe('POP');
  });
});

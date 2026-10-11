import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_MARKER_STYLE, loadMapMarkerStyle, MAP_MARKER_STYLE_KEY, saveMapMarkerStyle } from './mapPreferences';

describe('map marker preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to a colored location dot', () => {
    expect(loadMapMarkerStyle()).toBe(DEFAULT_MAP_MARKER_STYLE);
  });

  it('persists and restores a selected vehicle marker', () => {
    expect(saveMapMarkerStyle('motorcycle')).toBe(true);
    expect(localStorage.getItem(MAP_MARKER_STYLE_KEY)).toBe('motorcycle');
    expect(loadMapMarkerStyle()).toBe('motorcycle');
  });

  it('ignores an invalid stored preference', () => {
    localStorage.setItem(MAP_MARKER_STYLE_KEY, 'avatar');
    expect(loadMapMarkerStyle()).toBe('circle');
  });

  it('falls back safely when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadMapMarkerStyle()).toBe('circle');
    expect(saveMapMarkerStyle('car')).toBe(false);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

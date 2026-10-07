import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import ThemeProvider from './ThemeProvider';
import { useThemePreference } from './useThemePreference';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

describe('ThemeProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('defaults to the system preference and persists a selected theme', async () => {
    const { result } = renderHook(() => useThemePreference(), { wrapper });

    expect(result.current.preference).toBe('system');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));

    act(() => result.current.setPreference('dark'));

    expect(window.localStorage.getItem('roadtrip:theme-preference')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('restores a saved preference on mount', async () => {
    window.localStorage.setItem('roadtrip:theme-preference', 'light');
    const { result } = renderHook(() => useThemePreference(), { wrapper });

    expect(result.current.preference).toBe('light');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('tracks system color-scheme changes while System is selected', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    let matches = true;
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({
      get matches() { return matches; },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (event: string, callback: EventListenerOrEventListenerObject | null) => {
        if (event === 'change' && typeof callback === 'function') {
          listener = callback as (mediaEvent: MediaQueryListEvent) => void;
        }
      },
      removeEventListener: (event: string) => { if (event === 'change') listener = undefined; },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }) as MediaQueryList);
    const { result } = renderHook(() => useThemePreference(), { wrapper });

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    act(() => {
      matches = false;
      listener?.({ matches: false } as MediaQueryListEvent);
    });

    expect(result.current.preference).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

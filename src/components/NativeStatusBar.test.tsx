import { act, render, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeContext } from '../context/ThemeContext';
import type { ThemePreference } from '../context/themePreference';
import NativeStatusBar from './NativeStatusBar';

const native = vi.hoisted(() => ({ enabled: true, setStyle: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: native.setStyle }, Style: { Dark: 'DARK', Light: 'LIGHT' } }));

describe('NativeStatusBar', () => {
  let media: MediaQueryList;
  let changed: (() => void) | undefined;
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(() => {
    native.enabled = true;
    native.setStyle.mockReset().mockResolvedValue(undefined);
    changed = undefined;
    media = {
      matches: false,
      addEventListener: vi.fn((_event, handler) => { changed = handler as () => void; }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => media));
  });

  const view = (history: ReturnType<typeof createMemoryHistory>, preference: ThemePreference) => (
    <ThemeContext.Provider value={{ preference, setPreference: () => undefined }}>
      <NativeStatusBar history={history} />
    </ThemeContext.Provider>
  );

  it('uses dark icons on light pages and white icons on the live map and dark pages', async () => {
    const history = createMemoryHistory({ initialEntries: ['/home'] });
    const screen = render(view(history, 'light'));
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }));
    act(() => history.push('/ride-map/solo-1'));
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' }));
    act(() => history.push('/account'));
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }));
    screen.rerender(view(history, 'dark'));
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' }));
  });

  it('resolves system changes and ignores them with an explicit theme', async () => {
    const history = createMemoryHistory();
    const screen = render(view(history, 'system'));
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }));
    Object.defineProperty(media, 'matches', { value: true, configurable: true });
    act(() => changed?.());
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' }));
    screen.rerender(view(history, 'light'));
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }));
    act(() => changed?.());
    await waitFor(() => expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }));
  });

  it('does not call native plugins or subscribe in the browser', async () => {
    native.enabled = false;
    const history = createMemoryHistory();
    const listen = vi.spyOn(history, 'listen');
    render(view(history, 'light'));
    await act(async () => {});
    expect(native.setStyle).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    expect(media.addEventListener).not.toHaveBeenCalled();
  });

  it('removes theme and history listeners and cancels queued work on unmount', async () => {
    const history = createMemoryHistory();
    const unlisten = vi.fn();
    vi.spyOn(history, 'listen').mockReturnValue(unlisten);
    const screen = render(view(history, 'light'));
    screen.unmount();
    await act(async () => {});
    expect(unlisten).toHaveBeenCalledOnce();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', changed);
    expect(native.setStyle).not.toHaveBeenCalled();
  });

  it('serializes native updates so the newest route wins after an in-flight write', async () => {
    let complete: (() => void) | undefined;
    native.setStyle.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const history = createMemoryHistory({ initialEntries: ['/home'] });
    const screen = render(view(history, 'light'));
    await waitFor(() => expect(native.setStyle).toHaveBeenCalledOnce());
    act(() => history.push('/ride-map/solo-1'));
    screen.rerender(view(history, 'dark'));
    act(() => complete?.());
    await waitFor(() => expect(native.setStyle).toHaveBeenCalledTimes(2));
    expect(native.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  });
});

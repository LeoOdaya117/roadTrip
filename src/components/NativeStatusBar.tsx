import { useContext, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { History } from 'history';
import { ThemeContext } from '../context/ThemeContext';

export default function NativeStatusBar({ history }: { history: Pick<History, 'location' | 'listen'> }) {
  const { preference } = useContext(ThemeContext);
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let active = true;
    let revision = 0;
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && media.matches);
      const map = /^\/ride-map(?:\/|$)/.test(history.location.pathname);
      const style = dark || map ? Style.Dark : Style.Light;
      const request = ++revision;
      // Serialize native writes so a slower old route/theme cannot win the race.
      pending.current = pending.current.then(async () => {
        if (active && request === revision) await StatusBar.setStyle({ style });
      }).catch((error: unknown) => console.warn('Could not update status bar contrast', error));
    };
    const unlisten = history.listen(apply);
    if (media.addEventListener) media.addEventListener('change', apply);
    else media.addListener?.(apply);
    apply();
    return () => {
      active = false;
      unlisten();
      if (media.removeEventListener) media.removeEventListener('change', apply);
      else media.removeListener?.(apply);
    };
  }, [history, preference]);

  return null;
}

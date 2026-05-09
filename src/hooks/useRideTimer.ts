import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

export type RideTimerState = {
  /** Total elapsed ride seconds (excluding paused intervals) */
  elapsedSeconds: number;
  isRunning: boolean;
  /** HH:MM:SS formatted string */
  formatted: string;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setElapsed?: (seconds: number) => void;
  setRunning?: (running: boolean) => void;
};

const format = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export const useRideTimer = (): RideTimerState => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STORAGE_KEY = 'ride_timer_state_v1';
  const lastSavedRef = useRef<number | null>(null);
  const ignoreLoadRef = useRef<boolean>(false);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const saveState = (opts?: { elapsed?: number; running?: boolean }) => {
    try {
      const payload = {
        elapsedSeconds: typeof opts?.elapsed === 'number' ? opts.elapsed : elapsedSeconds,
        isRunning: typeof opts?.running === 'boolean' ? opts.running : isRunning,
        lastTs: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      lastSavedRef.current = payload.lastTs;
      console.debug('[useRideTimer] saved state', payload);
    } catch (_) {}
  };

  const loadState = (): { elapsedSeconds: number; isRunning: boolean; lastTs: number | null } | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { elapsedSeconds?: number; isRunning?: boolean; lastTs?: number };
      return {
        elapsedSeconds: Math.max(0, Math.floor(parsed.elapsedSeconds ?? 0)),
        isRunning: !!parsed.isRunning,
        lastTs: typeof parsed.lastTs === 'number' ? parsed.lastTs : null
      };
    } catch (_) {
      return null;
    }
  };

  const start = useCallback(() => {
    setElapsedSeconds(0);
    setIsRunning(true);
    // persist start immediately
    try { saveState({ elapsed: 0, running: true }); } catch (_) {}
    // briefly ignore reloads triggered immediately after starting
    try {
      ignoreLoadRef.current = true;
      setTimeout(() => { ignoreLoadRef.current = false; }, 2000);
    } catch (_) {}
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
    try { saveState({ running: false }); } catch (_) {}
  }, []);

  const resume = useCallback(() => {
    setIsRunning(true);
    try { saveState({ running: true }); } catch (_) {}
  }, []);

  const reset = useCallback(() => {
    // stop interval immediately and clear persisted state
    try { clearTimer(); } catch (_) {}
    setIsRunning(false);
    setElapsedSeconds(0);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }, []);

  // Ensure external 'ride:ended' events force a reset of the timer
  useEffect(() => {
    const handler = (e: Event) => {
      console.debug('[useRideTimer] received ride:ended event, resetting timer');
      try { reset(); } catch (_) {}
    };
    window.addEventListener('ride:ended', handler as EventListener);
    return () => window.removeEventListener('ride:ended', handler as EventListener);
  }, [reset]);

  const setElapsed = useCallback((seconds: number) => {
    setElapsedSeconds(Math.max(0, Math.floor(seconds)));
  }, []);

  const setRunning = useCallback((running: boolean) => {
    setIsRunning(running);
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isRunning]);

  // Persist elapsedSeconds on change
  useEffect(() => {
    try { saveState(); } catch (_) {}
  }, [elapsedSeconds]);

  // Handle app background/resume to account for paused timers
  useEffect(() => {
    let listener: PluginListenerHandle | null = null;
    App.addListener('appStateChange', async (state) => {
      console.debug('[useRideTimer] appStateChange', state);
      if (!state.isActive) {
        // app going to background — save current state with timestamp
        try { saveState(); } catch (_) {}
      } else {
        // app resumed — attempt to reload and reconcile
        try {
          if (ignoreLoadRef.current) {
            console.debug('[useRideTimer] ignoring saved-state reload due to recent start');
            return;
          }

          const saved = loadState();
          if (saved) {
            console.debug('[useRideTimer] loaded saved state on resume', saved);
            if (saved.isRunning) {
              const now = Date.now();
              const last = saved.lastTs ?? now;
              const deltaSec = Math.max(0, Math.floor((now - last) / 1000));
              const newElapsed = Math.max(0, saved.elapsedSeconds + deltaSec);
              setElapsedSeconds(newElapsed);
              setIsRunning(true);
            } else {
              setElapsedSeconds(saved.elapsedSeconds);
              setIsRunning(false);
            }
          }
        } catch (e) {
          console.debug('[useRideTimer] failed to reload saved state', e);
        }
      }
    }).then((h) => (listener = h));

    return () => { listener?.remove(); };
  }, []);

  return {
    elapsedSeconds,
    isRunning,
    formatted: format(elapsedSeconds),
    start,
    pause,
    resume,
    reset,
    setElapsed,
    setRunning,
  };
};

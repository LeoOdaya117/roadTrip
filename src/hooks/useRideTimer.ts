import { useCallback, useEffect, useRef, useState } from 'react';

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

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = useCallback(() => {
    setElapsedSeconds(0);
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    setIsRunning(true);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setElapsedSeconds(0);
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

  return {
    elapsedSeconds,
    isRunning,
    formatted: format(elapsedSeconds),
    start,
    pause,
    resume,
    reset,
  };
};

import { createContext } from 'react';

export interface AppState {
  ready: boolean;
  setReady: (value: boolean) => void;
}

export const AppContext = createContext<AppState | undefined>(undefined);

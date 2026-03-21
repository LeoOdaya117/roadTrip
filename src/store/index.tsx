import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AppState {
  ready: boolean;
  setReady: (v: boolean) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  return (
    <AppContext.Provider value={{ ready, setReady }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

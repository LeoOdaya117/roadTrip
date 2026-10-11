import React, { useState, type ReactNode } from 'react';
import { AppContext } from './appContext';

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  return (
    <AppContext.Provider value={{ ready, setReady }}>
      {children}
    </AppContext.Provider>
  );
}

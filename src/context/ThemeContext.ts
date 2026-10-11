import { createContext } from 'react';
import type { ThemePreference } from './themePreference';

export { type ThemePreference } from './themePreference';

export const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}>({
  preference: 'system',
  setPreference: () => undefined,
});

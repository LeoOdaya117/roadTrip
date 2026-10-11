import { useContext } from 'react';
import { ThemeContext } from './ThemeContext';

export const useThemePreference = () => useContext(ThemeContext);

import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { StatusBar } from 'react-native';
import { storage } from '../storage/mmkv';
import { KEYS } from '../storage/keys';
import { darkColors, lightColors, _setActiveTheme } from './colors';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  colors: typeof darkColors | typeof lightColors;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components outside provider.
    return { mode: 'light', isDark: false, setMode: () => {}, colors: lightColors };
  }
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode: ThemeMode = 'light';
  const isDark = false;

  const setMode = useCallback((_mode: ThemeMode) => {
    storage.set(KEYS.THEME_MODE, 'light');
  }, []);

  useEffect(() => {
    storage.set(KEYS.THEME_MODE, 'light');
  }, []);

  // Mutate the shared `colors` singleton so every file that imported it
  // reads the active palette on its next render / createStyles() call.
  _setActiveTheme(false);

  const themeColors = lightColors;

  const value = useMemo(
    () => ({ mode, isDark, setMode, colors: themeColors }),
    [setMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F4F6F8"
      />
      {children}
    </ThemeContext.Provider>
  );
}

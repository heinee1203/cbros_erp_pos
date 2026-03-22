import React, { createContext, useContext, useState, useMemo } from 'react';
import { useColorScheme, StatusBar } from 'react-native';
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
    // Fallback for components outside provider — return dark theme
    return { mode: 'dark', isDark: true, setMode: () => {}, colors: darkColors };
  }
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = storage.getString(KEYS.THEME_MODE);
    return (saved as ThemeMode) || 'dark';
  });

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.set(KEYS.THEME_MODE, m);
  };

  const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';

  // Mutate the shared `colors` singleton so every file that imported it
  // reads the active palette on its next render / createStyles() call.
  _setActiveTheme(isDark);

  const themeColors = isDark ? darkColors : lightColors;

  const value = useMemo(
    () => ({ mode, isDark, setMode, colors: themeColors }),
    [mode, isDark, themeColors],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#0D0D0F' : '#F5F3EF'}
      />
      {children}
    </ThemeContext.Provider>
  );
}

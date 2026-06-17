import { useState, useEffect, useCallback } from 'react';

export type ThemeName = 'cyan' | 'violet' | 'green' | 'gold';

export interface ThemeColors {
  name: ThemeName;
  label: string;
  hex: string;       // CSS hex for UI
  rgb: string;       // "r,g,b" for canvas / rgba()
  particleR: number;
  particleG: number;
  particleB: number;
}

export const THEMES: ThemeColors[] = [
  { name: 'cyan',   label: 'Cian',    hex: '#00d4ff', rgb: '0,212,255',   particleR: 0,   particleG: 212, particleB: 255 },
  { name: 'violet', label: 'Violeta', hex: '#a855f7', rgb: '168,85,247',  particleR: 168, particleG: 85,  particleB: 247 },
  { name: 'green',  label: 'Verde',   hex: '#22c55e', rgb: '34,197,94',   particleR: 34,  particleG: 197, particleB: 94  },
  { name: 'gold',   label: 'Dorado',  hex: '#f59e0b', rgb: '245,158,11',  particleR: 245, particleG: 158, particleB: 11  },
];

const STORAGE_KEY = 'mirror-theme';

export function useTheme() {
  const [themeName, setThemeNameState] = useState<ThemeName>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEMES.find(t => t.name === stored)) return stored as ThemeName;
    } catch {}
    return 'cyan';
  });

  const theme = THEMES.find(t => t.name === themeName) ?? THEMES[0];

  const setTheme = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
  }, []);

  // Apply CSS variable for UI elements that use var(--mirror-primary)
  useEffect(() => {
    document.documentElement.style.setProperty('--mirror-primary-rgb', theme.rgb);
    document.documentElement.style.setProperty('--mirror-primary-hex', theme.hex);
  }, [theme]);

  return { theme, setTheme, themes: THEMES };
}

"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ThemeDefinition, DEFAULT_THEMES, getThemeByName, applyTheme } from "@/lib/themes";

type Mode = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeDefinition;
  mode: Mode;
  setThemeName: (name: string) => void;
  toggleMode: () => void;
  availableThemes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  initialThemeName?: string;
}

export default function ThemeProvider({ children, initialThemeName = "ocean" }: ThemeProviderProps) {
  const [themeName, setThemeNameState] = useState(initialThemeName);
  const [mode, setMode] = useState<Mode>("light");

  const theme = getThemeByName(themeName) || DEFAULT_THEMES[0];

  useEffect(() => {
    applyTheme(theme, mode);
  }, [theme, mode]);

  const setThemeName = useCallback((name: string) => {
    setThemeNameState(name);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, mode, setThemeName, toggleMode, availableThemes: DEFAULT_THEMES }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

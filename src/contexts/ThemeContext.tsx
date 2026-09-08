import React, {
  useEffect,
  useState,
  useSyncExternalStore,
  useMemo,
} from "react";
import {
  ThemeContext,
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  getInitialTheme,
  getSystemThemeSnapshot,
  subscribeSystemTheme,
  type ResolvedTheme,
  type Theme,
} from "./theme";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => "light",
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;
  useEffect(() => {
    applyThemeToDocument(resolvedTheme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Continue without persistence if storage fails
    }
  }, [theme, resolvedTheme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

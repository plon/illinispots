import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  useMemo,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function subscribeSystemTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(MEDIA_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

export function getSystemThemeSnapshot(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Continue with default fallback if storage is inaccessible
  }
  return "system";
}

export function applyThemeToDocument(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      "content",
      resolved === "dark" ? "#09090b" : "#13294b",
    );
  }
}

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

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

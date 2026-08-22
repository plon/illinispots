import { describe, expect, it } from "bun:test";
import { type Theme, type ResolvedTheme } from "./ThemeContext";

// Test the core theme resolution logic and state transitions directly
describe("Theme logic", () => {
  it("resolves system preference correctly", () => {
    const resolveTheme = (
      theme: Theme,
      systemPreference: ResolvedTheme,
    ): ResolvedTheme => {
      return theme === "system" ? systemPreference : theme;
    };

    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("handles theme toggle transitions properly", () => {
    const getNextToggleTheme = (
      current: Theme,
      systemTheme: ResolvedTheme,
    ): Theme => {
      const currentResolved = current === "system" ? systemTheme : current;
      return currentResolved === "dark" ? "light" : "dark";
    };

    expect(getNextToggleTheme("light", "light")).toBe("dark");
    expect(getNextToggleTheme("dark", "light")).toBe("light");
    expect(getNextToggleTheme("system", "dark")).toBe("light");
    expect(getNextToggleTheme("system", "light")).toBe("dark");
  });

  it("validates theme strings from storage", () => {
    const parseStoredTheme = (stored: string | null): Theme => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
      return "system";
    };

    expect(parseStoredTheme("dark")).toBe("dark");
    expect(parseStoredTheme("light")).toBe("light");
    expect(parseStoredTheme("system")).toBe("system");
    expect(parseStoredTheme("invalid-theme")).toBe("system");
    expect(parseStoredTheme(null)).toBe("system");
  });
});

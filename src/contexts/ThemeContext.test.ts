import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ThemeProvider,
  getInitialTheme,
  getSystemThemeSnapshot,
  subscribeSystemTheme,
  applyThemeToDocument,
  useTheme,
  THEME_STORAGE_KEY,
  type ThemeContextType,
} from "./ThemeContext";

describe("ThemeContext production exports", () => {
  let localStorageStore: Record<string, string> = {};
  let matchMediaMatches = false;
  const classListSet = new Set<string>();
  const metaAttributes: Record<string, string> = {};
  let mediaQueryListener: (() => void) | null = null;

  beforeEach(() => {
    localStorageStore = {};
    matchMediaMatches = false;
    classListSet.clear();
    mediaQueryListener = null;

    // Mock document and documentElement
    const mockMetaElement = {
      setAttribute: (name: string, value: string) => {
        metaAttributes[name] = value;
      },
      getAttribute: (name: string) => metaAttributes[name] ?? null,
    };

    const mockDocumentElement = {
      classList: {
        add: (cls: string) => {
          classListSet.add(cls);
        },
        remove: (cls: string) => {
          classListSet.delete(cls);
        },
        toggle: (cls: string, force?: boolean) => {
          const shouldAdd = force !== undefined ? force : !classListSet.has(cls);
          if (shouldAdd) {
            classListSet.add(cls);
          } else {
            classListSet.delete(cls);
          }
          return classListSet.has(cls);
        },
        contains: (cls: string) => classListSet.has(cls),
      },
    };

    globalThis.document = {
      documentElement: mockDocumentElement,
      querySelector: (selector: string) => {
        if (selector === 'meta[name="theme-color"]') {
          return mockMetaElement;
        }
        return null;
      },
    } as unknown as Document;

    // Mock localStorage
    globalThis.localStorage = {
      getItem: (key: string) => localStorageStore[key] ?? null,
      setItem: (key: string, value: string) => {
        localStorageStore[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageStore[key];
      },
      clear: () => {
        localStorageStore = {};
      },
      length: 0,
      key: () => null,
    };

    // Mock window and matchMedia
    globalThis.window = {
      matchMedia: (query: string) =>
        ({
          matches: matchMediaMatches,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: (_event: string, handler: () => void) => {
            mediaQueryListener = handler;
          },
          removeEventListener: () => {
            mediaQueryListener = null;
          },
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    classListSet.clear();
  });

  describe("THEME_STORAGE_KEY", () => {
    it("uses 'theme' as the persistent storage key", () => {
      expect(THEME_STORAGE_KEY).toBe("theme");
    });
  });

  describe("getInitialTheme", () => {
    it("returns 'dark' when stored in localStorage", () => {
      localStorageStore[THEME_STORAGE_KEY] = "dark";
      expect(getInitialTheme()).toBe("dark");
    });

    it("returns 'light' when stored in localStorage", () => {
      localStorageStore[THEME_STORAGE_KEY] = "light";
      expect(getInitialTheme()).toBe("light");
    });

    it("returns 'system' when explicitly stored", () => {
      localStorageStore[THEME_STORAGE_KEY] = "system";
      expect(getInitialTheme()).toBe("system");
    });

    it("defaults to 'system' when localStorage is empty or null", () => {
      expect(getInitialTheme()).toBe("system");
    });

    it("defaults to 'system' when localStorage contains an invalid value", () => {
      localStorageStore[THEME_STORAGE_KEY] = "invalid_theme_value";
      expect(getInitialTheme()).toBe("system");
    });

    it("falls back to 'system' if localStorage.getItem throws an exception", () => {
      globalThis.localStorage.getItem = () => {
        throw new Error("Storage disabled by privacy policy");
      };
      expect(getInitialTheme()).toBe("system");
    });
  });

  describe("getSystemThemeSnapshot and subscribeSystemTheme", () => {
    it("returns 'dark' when prefers-color-scheme media query matches dark", () => {
      matchMediaMatches = true;
      expect(getSystemThemeSnapshot()).toBe("dark");
    });

    it("returns 'light' when prefers-color-scheme media query matches light", () => {
      matchMediaMatches = false;
      expect(getSystemThemeSnapshot()).toBe("light");
    });

    it("attaches and detaches change listener via subscribeSystemTheme", () => {
      let listenerCalled = false;
      const unsubscribe = subscribeSystemTheme(() => {
        listenerCalled = true;
      });

      expect(typeof mediaQueryListener).toBe("function");
      mediaQueryListener?.();
      expect(listenerCalled).toBe(true);

      unsubscribe();
      expect(mediaQueryListener).toBeNull();
    });
  });

  describe("applyThemeToDocument", () => {
    it("applies dark mode to documentElement and updates meta theme-color", () => {
      applyThemeToDocument("dark");

      expect(classListSet.has("dark")).toBe(true);
      expect(metaAttributes["content"]).toBe("#09090b");
    });

    it("applies light mode to documentElement and updates meta theme-color", () => {
      classListSet.add("dark");
      applyThemeToDocument("light");

      expect(classListSet.has("dark")).toBe(false);
      expect(metaAttributes["content"]).toBe("#13294b");
    });
  });

  describe("useTheme and ThemeProvider integration", () => {
    it("throws an error when used outside ThemeProvider", () => {
      function ConsumerOutsideProvider() {
        useTheme();
        return null;
      }

      expect(() => {
        renderToStaticMarkup(React.createElement(ConsumerOutsideProvider));
      }).toThrow("useTheme must be used within a ThemeProvider");
    });

    it("provides theme context when rendered within ThemeProvider", () => {
      let capturedContext: ThemeContextType | undefined;

      function Consumer() {
        capturedContext = useTheme();
        return React.createElement("span", null, capturedContext.theme);
      }

      renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(Consumer),
        ),
      );

      expect(capturedContext).toBeDefined();
      expect(capturedContext?.theme).toBe("system");
      expect(capturedContext?.resolvedTheme).toBe("light");
      expect(typeof capturedContext?.setTheme).toBe("function");
    });
  });
});

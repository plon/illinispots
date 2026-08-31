import { describe, expect, it, beforeEach } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useShowMapPreference,
  showMapStore,
  SHOW_MAP_STORAGE_KEY,
} from "./useShowMapPreference";

describe("useShowMapPreference store and hook", () => {
  let localStorageStore: Record<string, string> = {};

  beforeEach(() => {
    localStorageStore = {};

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

    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Window & typeof globalThis;

    showMapStore.set(true);
  });

  describe("showMapStore", () => {
    it("updates snapshot and persists boolean to localStorage", () => {
      showMapStore.set(false);
      expect(showMapStore.getSnapshot()).toBe(false);
      expect(localStorageStore[SHOW_MAP_STORAGE_KEY]).toBe("false");

      showMapStore.set(true);
      expect(showMapStore.getSnapshot()).toBe(true);
      expect(localStorageStore[SHOW_MAP_STORAGE_KEY]).toBe("true");
    });
  });

  describe("useShowMapPreference in React component", () => {
    it("provides safe SSR snapshot (true) and setter during server rendering", () => {
      let capturedSetter: React.Dispatch<React.SetStateAction<boolean>> | undefined;

      function TestComponent() {
        const [showMap, setShowMap] = useShowMapPreference();
        capturedSetter = setShowMap;
        return <div data-testid="map-state">{showMap ? "visible" : "hidden"}</div>;
      }

      const html = renderToStaticMarkup(<TestComponent />);
      expect(html).toContain('data-testid="map-state">visible</div>');
      expect(typeof capturedSetter).toBe("function");
    });
  });
});

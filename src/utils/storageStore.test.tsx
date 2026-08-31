import { describe, expect, it, beforeEach } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLocalStorageStore, useLocalStorage } from "./storageStore";

describe("storageStore", () => {
  let localStorageStore: Record<string, string> = {};
  let storageListeners: ((event: StorageEvent) => void)[] = [];

  beforeEach(() => {
    localStorageStore = {};
    storageListeners = [];

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
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === "storage") storageListeners.push(listener);
      },
      removeEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === "storage") {
          storageListeners = storageListeners.filter((l) => l !== listener);
        }
      },
    } as unknown as Window & typeof globalThis;
  });

  it("reads initial value from localStorage or falls back to defaultValue", () => {
    localStorageStore["test-key"] = JSON.stringify("stored");
    const store = createLocalStorageStore("test-key", "default");
    expect(store.getSnapshot()).toBe("stored");

    const fallbackStore = createLocalStorageStore("missing-key", "default");
    expect(fallbackStore.getSnapshot()).toBe("default");
  });

  it("updates snapshot and persists value on set", () => {
    const store = createLocalStorageStore("count-key", 0);
    store.set(5);
    expect(store.getSnapshot()).toBe(5);
    expect(localStorageStore["count-key"]).toBe("5");

    store.set((prev) => prev + 1);
    expect(store.getSnapshot()).toBe(6);
    expect(localStorageStore["count-key"]).toBe("6");
  });

  it("notifies subscribers when value changes", () => {
    const store = createLocalStorageStore("sub-key", "initial");
    let notified = false;
    const unsubscribe = store.subscribe(() => {
      notified = true;
    });

    store.set("updated");
    expect(notified).toBe(true);

    notified = false;
    unsubscribe();
    store.set("again");
    expect(notified).toBe(false);
  });

  it("syncs state on window storage events from other tabs", () => {
    const store = createLocalStorageStore("tab-key", "v1");
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });

    const event = {
      key: "tab-key",
      newValue: JSON.stringify("v2"),
    } as StorageEvent;

    for (const listener of storageListeners) {
      listener(event);
    }

    expect(notified).toBe(true);
    expect(store.getSnapshot()).toBe("v2");
  });

  it("integrates with useLocalStorage hook for SSR and component access", () => {
    const store = createLocalStorageStore("hook-key", "ssr-default");
    let capturedSetter: React.Dispatch<React.SetStateAction<string>> | undefined;

    function TestComponent() {
      const [value, setValue] = useLocalStorage(store);
      capturedSetter = setValue;
      return <span data-testid="val">{value}</span>;
    }

    const html = renderToStaticMarkup(<TestComponent />);
    expect(html).toContain('data-testid="val">ssr-default</span>');
    expect(typeof capturedSetter).toBe("function");
  });
});

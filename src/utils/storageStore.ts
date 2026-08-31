import { useCallback, useSyncExternalStore } from "react";

export interface StorageStore<T> {
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  subscribe: (callback: () => void) => () => void;
  set: (value: React.SetStateAction<T>) => void;
}

export function createLocalStorageStore<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string | null) => T = (v) =>
    v !== null ? (JSON.parse(v) as T) : defaultValue,
  serialize: (val: T) => string = (v) => JSON.stringify(v),
): StorageStore<T> {
  const read = (): T => {
    if (typeof window === "undefined") return defaultValue;
    try {
      return parse(localStorage.getItem(key));
    } catch {
      return defaultValue;
    }
  };

  let snapshot: T = read();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => defaultValue,
    subscribe: (callback: () => void) => {
      listeners.add(callback);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) {
          snapshot = parse(event.newValue);
          notify();
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
      }
      return () => {
        listeners.delete(callback);
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage);
        }
      };
    },
    set: (value: React.SetStateAction<T>) => {
      const next =
        typeof value === "function"
          ? (value as (prev: T) => T)(snapshot)
          : value;
      if (snapshot === next) return;
      snapshot = next;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(key, serialize(next));
        } catch {
          // Continue without persistence if storage is unavailable.
        }
      }
      notify();
    },
  };
}

export function useLocalStorage<T>(
  store: StorageStore<T>,
): [T, (value: React.SetStateAction<T>) => void] {
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const setValue = useCallback(
    (next: React.SetStateAction<T>) => {
      store.set(next);
    },
    [store],
  );

  return [value, setValue];
}

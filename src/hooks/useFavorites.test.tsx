import { describe, expect, it, beforeEach } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseFavorites,
  favoritesStore,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  useFavorites,
  FAVORITES_STORAGE_KEY,
  type FavoriteItem,
} from "./useFavorites";

describe("useFavorites store and hook", () => {
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

    favoritesStore.set([]);
  });

  describe("parseFavorites", () => {
    it("returns empty array for null, empty or invalid JSON", () => {
      expect(parseFavorites(null)).toEqual([]);
      expect(parseFavorites("")).toEqual([]);
      expect(parseFavorites("not-json")).toEqual([]);
      expect(parseFavorites('{"id":"1"}')).toEqual([]);
    });

    it("filters out invalid items and keeps valid ones", () => {
      const mixed = JSON.stringify([
        { id: "grainger", name: "Grainger Library", type: "library" },
        { id: "bad-1", name: "Bad Type", type: "gym" },
        { id: "bad-2" },
        null,
        "string",
        { id: "siebel", name: "Siebel Center", type: "academic" },
      ]);

      const parsed = parseFavorites(mixed);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({
        id: "grainger",
        name: "Grainger Library",
        type: "library",
      });
      expect(parsed[1]).toEqual({
        id: "siebel",
        name: "Siebel Center",
        type: "academic",
      });
    });
  });

  describe("mutation actions", () => {
    const item1: FavoriteItem = {
      id: "grainger",
      name: "Grainger",
      type: "library",
    };
    const item2: FavoriteItem = {
      id: "siebel",
      name: "Siebel",
      type: "academic",
    };

    it("adds item and persists to localStorage", () => {
      addFavorite(item1);
      expect(favoritesStore.getSnapshot()).toEqual([item1]);
      expect(localStorageStore[FAVORITES_STORAGE_KEY]).toBe(
        JSON.stringify([item1]),
      );

      // Adding again is a no-op
      addFavorite(item1);
      expect(favoritesStore.getSnapshot()).toEqual([item1]);
    });

    it("removes item and persists to localStorage", () => {
      favoritesStore.set([item1, item2]);
      removeFavorite("grainger");
      expect(favoritesStore.getSnapshot()).toEqual([item2]);
      expect(localStorageStore[FAVORITES_STORAGE_KEY]).toBe(
        JSON.stringify([item2]),
      );
    });

    it("toggles item on and off", () => {
      toggleFavorite(item1);
      expect(favoritesStore.getSnapshot()).toEqual([item1]);

      toggleFavorite(item1);
      expect(favoritesStore.getSnapshot()).toEqual([]);
    });
  });

  describe("useFavorites hook", () => {
    it("provides safe SSR snapshot and bound actions during server rendering", () => {
      function TestComponent() {
        const favorites = useFavorites();
        return (
          <span
            data-testid="count"
            data-add-type={typeof favorites.addFavorite}
            data-remove-type={typeof favorites.removeFavorite}
            data-toggle-type={typeof favorites.toggleFavorite}
            data-is-favorite-type={typeof favorites.isFavorite}
            data-get-by-type={typeof favorites.getFavoritesByType}
          >
            {favorites.favorites.length}
          </span>
        );
      }

      const html = renderToStaticMarkup(<TestComponent />);
      expect(html).toContain('data-testid="count"');
      expect(html).toContain('data-add-type="function"');
      expect(html).toContain('data-remove-type="function"');
      expect(html).toContain('data-toggle-type="function"');
      expect(html).toContain('data-is-favorite-type="function"');
      expect(html).toContain('data-get-by-type="function"');
      expect(html).toContain(">0</span>");
    });
  });
});

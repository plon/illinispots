import { useCallback, useSyncExternalStore } from "react";
import { createLocalStorageStore } from "@/utils/storageStore";

export const FAVORITES_STORAGE_KEY = "illinispots-favorites";

export interface FavoriteItem {
  id: string;
  name: string;
  type: "library" | "academic";
}

export interface UseFavoritesResult {
  favorites: FavoriteItem[];
  addFavorite: (item: FavoriteItem) => void;
  removeFavorite: (id: string) => void;
  toggleFavorite: (item: FavoriteItem) => void;
  isFavorite: (id: string) => boolean;
  getFavoritesByType: (type: "library" | "academic") => FavoriteItem[];
}

function isValidFavoriteItem(item: unknown): item is FavoriteItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FavoriteItem).id === "string" &&
    typeof (item as FavoriteItem).name === "string" &&
    ((item as FavoriteItem).type === "library" ||
      (item as FavoriteItem).type === "academic")
  );
}

export function parseFavorites(raw: string | null): FavoriteItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFavoriteItem);
  } catch {
    return [];
  }
}

export const favoritesStore = createLocalStorageStore<FavoriteItem[]>(
  FAVORITES_STORAGE_KEY,
  [],
  parseFavorites,
);

export function addFavorite(item: FavoriteItem): void {
  favoritesStore.set((prev) =>
    prev.some((fav) => fav.id === item.id) ? prev : [...prev, item],
  );
}

export function removeFavorite(id: string): void {
  favoritesStore.set((prev) => prev.filter((fav) => fav.id !== id));
}

export function toggleFavorite(item: FavoriteItem): void {
  favoritesStore.set((prev) =>
    prev.some((fav) => fav.id === item.id)
      ? prev.filter((fav) => fav.id !== item.id)
      : [...prev, item],
  );
}

export const useFavorites = (): UseFavoritesResult => {
  const favorites = useSyncExternalStore(
    favoritesStore.subscribe,
    favoritesStore.getSnapshot,
    favoritesStore.getServerSnapshot,
  );

  const isFavorite = useCallback(
    (id: string) => favorites.some((fav) => fav.id === id),
    [favorites],
  );

  const getFavoritesByType = useCallback(
    (type: "library" | "academic") =>
      favorites.filter((fav) => fav.type === type),
    [favorites],
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    getFavoritesByType,
  };
};

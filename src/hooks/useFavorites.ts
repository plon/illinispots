import { useState, useEffect, useCallback } from 'react';

const FAVORITES_STORAGE_KEY = 'illinispots-favorites';

export interface FavoriteItem {
  id: string;
  name: string;
  type: 'library' | 'academic';
}

const loadFavorites = (): FavoriteItem[] => {
  if (typeof localStorage === 'undefined') return [];

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error loading favorites from localStorage:', error);
    return [];
  }
};

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(loadFavorites);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error('Error saving favorites to localStorage:', error);
    }
  }, [favorites]);

  const addFavorite = useCallback((item: FavoriteItem) => {
    setFavorites(prev => {
      // Check if already favorited
      if (prev.some(fav => fav.id === item.id)) {
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites(prev => prev.filter(fav => fav.id !== id));
  }, []);

  const toggleFavorite = useCallback((item: FavoriteItem) => {
    setFavorites(prev => {
      const exists = prev.some(fav => fav.id === item.id);
      if (exists) {
        return prev.filter(fav => fav.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  }, []);

  const isFavorite = useCallback((id: string) => {
    return favorites.some(fav => fav.id === id);
  }, [favorites]);

  const getFavoritesByType = useCallback((type: 'library' | 'academic') => {
    return favorites.filter(fav => fav.type === type);
  }, [favorites]);

  return {
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    getFavoritesByType,
  };
};

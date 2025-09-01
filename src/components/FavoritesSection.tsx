import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FavoriteItem } from '@/hooks/useFavorites';
import { Facility, FacilityStatus } from '@/types';
import { Star } from 'lucide-react';

interface FavoritesSectionProps {
  favorites: FavoriteItem[];
  facilityData: FacilityStatus | null;
  onFavoriteClick: (facilityId: string, type: 'library' | 'academic') => void;
  onToggleFavorite: (item: FavoriteItem) => void;
}

export const FavoritesSection: React.FC<FavoritesSectionProps> = ({
  favorites,
  facilityData,
  onFavoriteClick,
  onToggleFavorite,
}) => {
  if (favorites.length === 0) {
    return null;
  }

  const getFacilityData = (favoriteId: string): Facility | null => {
    if (!facilityData) return null;
    return Object.values(facilityData.facilities).find(
      facility => facility.id === favoriteId
    ) || null;
  };

  return (
    <div className="mt-2">
      <h2 className="text-sm font-normal text-muted-foreground pl-6">
        Favorites
      </h2>
      <div className="mt-1 space-y-1">
        {favorites.map((favorite) => {
          const facilityData = getFacilityData(favorite.id);
          
          const handleStarClick = (e: React.MouseEvent) => {
            e.stopPropagation(); // Prevent facility click
            onToggleFavorite(favorite);
          };

          const handleFacilityClick = () => {
            onFavoriteClick(favorite.id, favorite.type);
          };
          
          return (
            <div
              key={favorite.id}
              className="mx-4 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={handleFacilityClick}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    onClick={handleStarClick}
                    className="text-yellow-500 hover:text-yellow-600 flex-shrink-0 p-0.5 rounded-full hover:bg-muted/50 transition-colors"
                    aria-label="Remove from favorites"
                    title="Remove from favorites"
                  >
                    <Star size={16} fill="currentColor" />
                  </button>
                  <span className="font-medium text-sm truncate">{favorite.name}</span>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {facilityData ? (
                    !facilityData.isOpen ? (
                      <Badge
                        variant="outline"
                        className="bg-gray-50 text-gray-700 border-gray-300 text-xs"
                      >
                        CLOSED
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          facilityData.roomCounts.available > 0
                            ? "bg-green-50 text-green-700 border-green-300"
                            : "bg-red-50 text-red-700 border-red-300"
                        }`}
                      >
                        {facilityData.roomCounts.available}/{facilityData.roomCounts.total}
                      </Badge>
                    )
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300 text-xs">
                      --
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
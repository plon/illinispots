import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FavoriteItem } from '@/hooks/useFavorites';
import { Facility, FacilityStatus } from '@/types';
import {
  STATUS_BADGE_STYLES,
  getFacilityAvailabilityBadgeStyle,
} from '@/components/RoomBadge';
import { Star } from 'lucide-react';

interface FavoritesSectionProps {
  favorites: FavoriteItem[];
  facilityData: FacilityStatus | null;
  onFavoriteClick: (
    facilityId: string,
    type: 'library' | 'academic',
    facilityName: string,
  ) => void;
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
          const facility = getFacilityData(favorite.id);

          return (
            <div
              key={favorite.id}
              className="mx-4 flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <button
                type="button"
                onClick={() => onToggleFavorite(favorite)}
                className="flex-shrink-0 rounded-full p-0.5 text-yellow-500 transition-colors hover:bg-muted/50 hover:text-yellow-600"
                aria-label={`Remove ${favorite.name} from favorites`}
                title={`Remove ${favorite.name} from favorites`}
              >
                <Star size={16} fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onFavoriteClick(favorite.id, favorite.type, favorite.name)
                }
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <span className="truncate text-sm font-medium">
                  {favorite.name}
                </span>
                <span className="flex-shrink-0">
                  {facility ? (
                    !facility.isOpen ? (
                      <Badge
                        variant="outline"
                        className={`${STATUS_BADGE_STYLES.closed} text-xs`}
                      >
                        CLOSED
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`${getFacilityAvailabilityBadgeStyle(
                          true,
                          facility.roomCounts.available,
                        )} text-xs`}
                      >
                        {facility.roomCounts.available}/
                        {facility.roomCounts.total}
                      </Badge>
                    )
                  ) : (
                    <Badge
                      variant="outline"
                      className={`${STATUS_BADGE_STYLES.closed} text-xs`}
                    >
                      --
                    </Badge>
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoriteItem } from '@/hooks/useFavorites';

interface FavoriteButtonProps {
  facility: {
    id: string;
    name: string;
    type: 'library' | 'academic';
  };
  isFavorite: boolean;
  onToggle: (item: FavoriteItem) => void;
  size?: 'sm' | 'md';
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  facility,
  isFavorite,
  onToggle,
  size = 'sm',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent accordion toggle
    onToggle({
      id: facility.id,
      name: facility.name,
      type: facility.type,
    });
  };

  const iconSize = size === 'sm' ? 12 : 16;
  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`${buttonSize} rounded-full hover:bg-muted/50 ${
        isFavorite 
          ? 'text-yellow-500 hover:text-yellow-600' 
          : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={handleClick}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star 
        size={iconSize} 
        fill={isFavorite ? 'currentColor' : 'none'}
        className="transition-colors"
      />
    </Button>
  );
};
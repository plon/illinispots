import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Search } from 'lucide-react';
import { Facility, FacilityStatus, FacilityType } from '@/types';
import { FavoriteItem } from '@/hooks/useFavorites';
import Fuse from 'fuse.js';

interface AddFavoritesDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    facilityData: FacilityStatus | null;
    favorites: FavoriteItem[];
    onToggleFavorite: (item: FavoriteItem) => void;
}

export const AddFavoritesDialog: React.FC<AddFavoritesDialogProps> = ({
    isOpen,
    onOpenChange,
    facilityData,
    favorites,
    onToggleFavorite,
}) => {
    const [searchTerm, setSearchTerm] = useState("");

    const facilities = useMemo(() => {
        if (!facilityData) return [];
        return Object.values(facilityData.facilities).sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    }, [facilityData]);

    const filteredFacilities = useMemo(() => {
        if (!searchTerm) return facilities;

        const fuse = new Fuse(facilities, {
            keys: ["name"],
            threshold: 0.3,
            ignoreLocation: true,
        });

        return fuse.search(searchTerm).map(result => result.item);
    }, [facilities, searchTerm]);

    const isFavorite = (id: string) => favorites.some(f => f.id === id);

    const handleToggle = (facility: Facility) => {
        onToggleFavorite({
            id: facility.id,
            name: facility.name,
            type: facility.type === FacilityType.LIBRARY ? 'library' : 'academic'
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] flex flex-col h-[80vh] sm:h-[600px] p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>Add Favorites</DialogTitle>
                    <DialogDescription>
                        Search and select buildings to add to your favorites list.
                    </DialogDescription>
                    <div className="relative mt-2">
                        <Search
                            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            placeholder="Search buildings..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </DialogHeader>
                <ScrollArea className="flex-1">
                    <div className="divide-y border-t border-b">
                        {filteredFacilities.length > 0 ? (
                            filteredFacilities.map((facility) => {
                                const active = isFavorite(facility.id);
                                return (
                                    <div
                                        key={facility.id}
                                        className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
                                    >
                                        <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                                            <span className="font-medium text-sm truncate">{facility.name}</span>
                                        </div>
                                        <Switch
                                            checked={active}
                                            onCheckedChange={() => handleToggle(facility)}
                                        />
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-center text-muted-foreground text-sm py-8 border-none">
                                No buildings found matching &quot;{searchTerm}&quot;
                            </p>
                        )}
                    </div>
                </ScrollArea>
                <div className="p-4 border-t bg-muted/20 text-xs text-center text-muted-foreground">
                    Favorites appear at the top of the sidebar for quick access.
                </div>
            </DialogContent>
        </Dialog>
    );
};

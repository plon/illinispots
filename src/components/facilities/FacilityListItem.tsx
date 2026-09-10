import React, { useMemo, memo } from "react";
import { Badge } from "@/components/ui/badge";
import { type Facility, RoomStatus } from "@/types";
import {
  type FilterCriteria,
  EMPTY_FILTER_CRITERIA,
  isRoomAvailable,
} from "@/utils/filterUtils";
import {
  getFacilityAvailabilityBadgeStyle,
} from "@/components/RoomBadge";
import { ChevronRight } from "lucide-react";

interface FacilityListItemProps {
  facility: Facility;
  onSelect: (facilityId: string) => void;
  filterCriteria?: FilterCriteria;
}

export const FacilityListItem: React.FC<FacilityListItemProps> = memo(
  ({ facility, onSelect, filterCriteria = EMPTY_FILTER_CRITERIA }) => {
    const filteredAvailableCount = useMemo(
      () => {
        if (!facility.isOpen) {return 0;}

        return Object.values(facility.rooms).filter((room) => {
          const isAvailableOrPassing =
            room.status === RoomStatus.AVAILABLE ||
            room.status === RoomStatus.PASSING_PERIOD;

          return isAvailableOrPassing && isRoomAvailable(room, filterCriteria);
        }).length;
      },
      [facility.isOpen, facility.rooms, filterCriteria],
    );

    return (
      <button
        type="button"
        onClick={() => onSelect(facility.id)}
        className="w-full px-4 min-h-[44px] py-2.5 flex items-center justify-between hover:bg-muted/40 active:bg-muted/60 transition-colors text-left group border-b border-border/70 last:border-b-0 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-muted/40 cursor-pointer"
        aria-label={`View ${facility.name} details`}
      >
        <div className="min-w-0 flex-1 pr-2 text-left">
          <span className="font-medium text-sm truncate block text-foreground group-hover:text-primary transition-colors">
            {facility.name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={`${getFacilityAvailabilityBadgeStyle(
              facility.isOpen,
              filteredAvailableCount,
            )} text-xs`}
          >
            {facility.isOpen
              ? `${filteredAvailableCount}/${facility.roomCounts.total}`
              : "CLOSED"}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>
    );
  },
);

FacilityListItem.displayName = "FacilityListItem";

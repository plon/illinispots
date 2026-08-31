import React, { useMemo, memo } from "react";
import { usePostHog } from "@posthog/react";
import { Badge } from "@/components/ui/badge";
import {
  Facility,
  FacilityType,
  RoomStatus,
} from "@/types";
import { FilterCriteria, isRoomAvailable } from "@/utils/filterUtils";
import {
  STATUS_BADGE_STYLES,
  getFacilityAvailabilityBadgeStyle,
} from "@/components/RoomBadge";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FacilityRoomView } from "./FacilityRoomView";

interface FacilityAccordionItemProps {
  facility: Facility;
  facilityType: FacilityType;
  isOpen: boolean;
  onToggle: () => void;
  filterCriteria?: FilterCriteria;
}

export const FacilityAccordionItem: React.FC<FacilityAccordionItemProps> = memo(
  ({
    facility,
    facilityType,
    isOpen,
    onToggle,
    filterCriteria = {},
  }) => {
    const posthog = usePostHog();

    const filteredAvailableCount = useMemo(() => {
      return Object.values(facility.rooms).filter((room) => {
        const isAvailableOrPassing =
          room.status === RoomStatus.AVAILABLE ||
          room.status === RoomStatus.PASSING_PERIOD;

        return isAvailableOrPassing && isRoomAvailable(room, filterCriteria);
      }).length;
    }, [facility.rooms, filterCriteria]);

    const handleTriggerClick = () => {
      const willOpen = !isOpen;
      if (willOpen) {
        posthog.capture("facility_accordion_expanded", {
          facility_id: facility.id,
          facility_name: facility.name,
          facility_type: facilityType,
          selection_source: "list",
        });
      }
      onToggle();
    };

    return (
      <AccordionItem
        value={facility.id}
        id={`facility-${facility.id}`}
        className="border-b border-border/70 last:border-b-0 scroll-mt-14"
      >
        <div className="sticky top-0 bg-background z-10">
          <AccordionTrigger
            onClick={handleTriggerClick}
            className="flex items-center justify-between w-full px-4 min-h-[40px] py-2 hover:no-underline hover:bg-muted/40 transition-colors text-left group"
            aria-label={`${facility.name} details`}
          >
            <div className="min-w-0 flex-1 pr-2 text-left">
              <span className="font-medium text-sm truncate block text-foreground">
                {facility.name}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 mr-2">
              {!facility.isOpen ? (
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
                    filteredAvailableCount,
                  )} text-xs`}
                >
                  {filteredAvailableCount}/{facility.roomCounts.total}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
        </div>

        <AccordionContent className="pb-0 pt-0">
          <FacilityRoomView
            facility={facility}
            facilityType={facilityType}
            filterCriteria={filterCriteria}
          />
        </AccordionContent>
      </AccordionItem>
    );
  },
);

FacilityAccordionItem.displayName = "FacilityAccordionItem";

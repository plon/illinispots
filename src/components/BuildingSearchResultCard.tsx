import React, { useState } from "react";
import { SearchResultBuilding } from "@/utils/searchUtils";
import { FacilityType, RoomStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/utils/format";
import { getLibraryHoursMessage } from "@/utils/libraryHours";
import { RoomSearchResultCard } from "@/components/RoomSearchResultCard";
import {
  STATUS_BADGE_STYLES,
  getFacilityAvailabilityBadgeStyle,
} from "@/components/RoomBadge";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  DoorOpen,
} from "lucide-react";

interface BuildingSearchResultCardProps {
  buildingResult: SearchResultBuilding;
}

export const BuildingSearchResultCard: React.FC<BuildingSearchResultCardProps> = ({
  buildingResult,
}) => {
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);
  const {
    facility,
    facilityName,
    facilityType,
    availableRoomsCount,
    totalRoomsCount,
    matchingRooms,
  } = buildingResult;

  const isLibrary = facilityType === FacilityType.LIBRARY;
  const isOpen = facility.isOpen;

  // Prepare rooms for preview (matching rooms or all rooms in facility)
  const previewRooms = React.useMemo(() => {
    if (matchingRooms.length > 0) {
      return matchingRooms;
    }
    // Fallback: all rooms in this facility formatted as SearchResultRoom
    return Object.entries(facility.rooms)
      .map(([roomNumber, room]) => ({
        type: "room" as const,
        roomNumber,
        facilityId: facility.id,
        facilityName: facility.name,
        facilityType: facility.type,
        room,
        facility,
        score: 0.5,
      }))
      .sort((a, b) => {
        const isAvailA =
          a.room.status === RoomStatus.AVAILABLE ||
          a.room.status === RoomStatus.PASSING_PERIOD;
        const isAvailB =
          b.room.status === RoomStatus.AVAILABLE ||
          b.room.status === RoomStatus.PASSING_PERIOD;
        if (isAvailA !== isAvailB) return isAvailA ? -1 : 1;
        return a.roomNumber.localeCompare(b.roomNumber, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
  }, [matchingRooms, facility]);

  return (
    <div className="rounded-lg border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 transition-all duration-150 space-y-2.5">
      {/* Header: Name, Type, and Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-primary shrink-0" />
            <h3 className="font-semibold text-base text-foreground tracking-tight truncate">
              {facilityName}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge
              variant="secondary"
              className="text-[10px] uppercase font-semibold tracking-wider h-4 px-1.5 bg-muted text-muted-foreground"
            >
              {isLibrary ? "Library" : "Academic"}
            </Badge>
            {facility.address && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                {facility.address}
              </span>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {!isOpen ? (
            <Badge
              variant="outline"
              className={`${STATUS_BADGE_STYLES.closed} text-xs`}
            >
              CLOSED
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={`${getFacilityAvailabilityBadgeStyle(true, availableRoomsCount)} text-xs`}
            >
              {availableRoomsCount}/{totalRoomsCount} Available
            </Badge>
          )}
        </div>
      </div>

      {/* Operating Hours Info */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/20 rounded-md px-2.5 py-1.5 border border-border/30">
        <Clock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        {isLibrary ? (
          <span>{getLibraryHoursMessage(facility.name)}</span>
        ) : isOpen ? (
          <span>
            Open today
            {facility.hours?.open && facility.hours?.close && (
              <> ({formatTime(facility.hours.open)} - {formatTime(facility.hours.close)})</>
            )}
          </span>
        ) : (
          <span>
            Closed
            {facility.hours?.open ? ` • Opens at ${formatTime(facility.hours.open)}` : " • Not open today"}
          </span>
        )}
      </div>

      {/* Actions Row */}
      <div className="flex items-center gap-2 pt-1">
        {/* Toggle Rooms Button */}
        {previewRooms.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsRoomsOpen(!isRoomsOpen)}
            className="h-8 text-xs font-medium gap-1.5 hover:bg-secondary"
            aria-expanded={isRoomsOpen}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            {isRoomsOpen
              ? "Hide Rooms"
              : `View Rooms (${previewRooms.length})`}
            {isRoomsOpen ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            )}
          </Button>
        )}
      </div>

      {/* Collapsible Rooms List */}
      {isRoomsOpen && (
        <div className="pt-2 border-t border-border/60 mt-2 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pl-1">
            Rooms in {facility.name} ({previewRooms.length})
          </p>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {previewRooms.map((roomResult) => (
              <RoomSearchResultCard
                key={`${roomResult.facilityId}-${roomResult.roomNumber}`}
                roomResult={roomResult}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

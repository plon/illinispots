import React, { useState, useMemo, memo } from "react";
import { Facility, FacilityType } from "@/types";
import { FilterCriteria, isRoomAvailable } from "@/utils/filterUtils";
import { getLibraryHoursMessage } from "@/utils/libraryHours";
import { formatTimeForDisplay } from "@/utils/time";
import { RoomRow } from "./RoomRow";
import { groupAcademicRooms } from "./roomUtils";

interface FacilityRoomViewProps {
  facility: Facility;
  filterCriteria?: FilterCriteria;
}

type RoomTab = "available" | "occupied" | "all";

export const FacilityRoomView: React.FC<FacilityRoomViewProps> = memo(
  ({ facility, filterCriteria = {} }) => {
    const isAcademic = facility.type === FacilityType.ACADEMIC;
    const [activeTab, setActiveTab] = useState<RoomTab>("available");
    const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

    // Filter and sort rooms
    const allRooms = useMemo(() => {
      return Object.entries(facility.rooms)
        .filter(([, room]) => isRoomAvailable(room, filterCriteria))
        .sort(([numA], [numB]) =>
          numA.localeCompare(numB, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
    }, [facility.rooms, filterCriteria]);

    const { availableRooms, occupiedRooms } = useMemo(
      () => groupAcademicRooms(allRooms),
      [allRooms],
    );

    if (!facility.isOpen) {
      return (
        <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/20 border-t">
          {facility.type === FacilityType.LIBRARY ? (
            getLibraryHoursMessage(facility.name)
          ) : (
            <div>
              <p>Building is currently closed</p>
              {facility.hours?.open ? (
                <p className="text-xs mt-0.5">
                  Opens at {formatTimeForDisplay(facility.hours.open)}
                </p>
              ) : (
                <p className="text-xs mt-0.5">Not open today</p>
              )}
            </div>
          )}
        </div>
      );
    }

    const roomsToDisplay = isAcademic
      ? activeTab === "available"
        ? availableRooms
        : activeTab === "occupied"
          ? occupiedRooms
          : allRooms
      : allRooms;

    return (
      <div className="bg-muted/10 border-t border-border/60">
        {/* Segmented Filter Control for Academic facilities */}
        {isAcademic && (
          <div className="px-4 pt-2.5 pb-2">
            <div
              role="tablist"
              aria-label="Filter rooms by status"
              className="flex items-center bg-muted/80 p-0.5 rounded-lg text-xs font-medium border border-border/50"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "available"}
                onClick={() => setActiveTab("available")}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  activeTab === "available"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Available ({availableRooms.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "occupied"}
                onClick={() => setActiveTab("occupied")}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  activeTab === "occupied"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Occupied ({occupiedRooms.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "all"}
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  activeTab === "all"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({allRooms.length})
              </button>
            </div>
          </div>
        )}

        {/* Continuous Room List */}
        <div className="divide-y divide-border/40 border-t border-border/40">
          {roomsToDisplay.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4 px-4">
              {activeTab === "available"
                ? "No rooms currently available."
                : activeTab === "occupied"
                  ? "No rooms currently occupied."
                  : "No rooms match your filter criteria."}
            </p>
          ) : (
            roomsToDisplay.map(([roomNumber, room]) => (
              <RoomRow
                key={roomNumber}
                roomName={roomNumber}
                room={room}
                facilityId={facility.id}
                facilityName={facility.name}
                isExpanded={expandedRoomId === roomNumber}
                onToggleExpand={() =>
                  setExpandedRoomId((prev) =>
                    prev === roomNumber ? null : roomNumber,
                  )
                }
              />
            ))
          )}
        </div>
      </div>
    );
  },
);

FacilityRoomView.displayName = "FacilityRoomView";

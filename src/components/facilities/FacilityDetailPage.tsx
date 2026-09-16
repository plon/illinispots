import React, {
  useState,
  useMemo,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { type Facility, type RoomDetails, FacilityType } from "@/types";
import {
  type FilterCriteria,
  EMPTY_FILTER_CRITERIA,
  isRoomAvailable,
} from "@/utils/filterUtils";
import { getLibraryHoursMessage } from "@/utils/libraryHours";
import { formatTimeForDisplay } from "@/utils/time";
import {
  STATUS_BADGE_STYLES,
  getFacilityAvailabilityBadgeStyle,
} from "@/components/RoomBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoomRow } from "./RoomRow";
import { RoomStatusTabs, type RoomTab } from "./RoomStatusTabs";
import { groupAcademicRooms } from "./roomUtils";
import { Clock, Star } from "lucide-react";

const ROOM_DETAILS_CACHE_TIME_MS = 10 * 60 * 1000;

interface FacilityDetailPageProps {
  facility: Facility;
  onBack: () => void;
  filterCriteria?: FilterCriteria;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  roomSearchQuery?: string;
  onClearRoomSearch?: () => void;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
}

export function shouldIgnoreEscapeForBack(target: unknown): boolean {
  if (
    typeof target !== "object" ||
    target === null ||
    typeof (target as HTMLElement).closest !== "function"
  ) {
    return false;
  }
  return (
    (target as HTMLElement).closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]',
    ) !== null
  );
}

const useEscapeToBack = (onBack: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (shouldIgnoreEscapeForBack(event.target)) {
        return;
      }
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);
};

export const FacilityDetailPage: React.FC<FacilityDetailPageProps> = memo(
  ({
    facility,
    onBack,
    filterCriteria = EMPTY_FILTER_CRITERIA,
    isFavorite = false,
    onToggleFavorite,
    roomSearchQuery = "",
    onClearRoomSearch,
    selectedRoomId,
    onSelectRoom,
  }) => {
    const isAcademic = facility.type === FacilityType.ACADEMIC;
    const [activeTab, setActiveTab] = useState<RoomTab>("available");
    const [localExpandedRoomId, setLocalExpandedRoomId] =
      useState<string | null>(null);
    const expandedRoomId =
      selectedRoomId === undefined ? localExpandedRoomId : selectedRoomId;
    const selectedRoomRef = useRef<HTMLDivElement>(null);

    useEscapeToBack(onBack);

    const { data: roomDetails } = useQuery<RoomDetails[], Error>({
      queryKey: ["roomDetails", facility.name],
      queryFn: async () => {
        const response = await fetch(
          `/api/room-details?buildingName=${encodeURIComponent(facility.name)}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch room details: ${response.statusText}`);
        }
        return response.json();
      },
      enabled: isAcademic && facility.isOpen,
      staleTime: ROOM_DETAILS_CACHE_TIME_MS,
      gcTime: ROOM_DETAILS_CACHE_TIME_MS,
      refetchOnMount: true,
      retry: 1,
    });

    const detailsByRoom = useMemo(() => {
      const map = new Map<string, RoomDetails>();
      for (const details of roomDetails ?? []) {
        map.set(details.roomNumber, details);
      }
      return map;
    }, [roomDetails]);

    // Keep the full room set for the Academic Occupied and All tabs. The
    // availability criteria only narrow available academic rooms and the
    // library list, which has no separate status tabs.
    const allRooms = useMemo(
      () =>
        Object.entries(facility.rooms)
          .sort(([numA], [numB]) =>
            numA.localeCompare(numB, undefined, {
              numeric: true,
              sensitivity: "base",
            }),
          ),
      [facility.rooms],
    );

    const { availableRooms: allAvailableRooms, occupiedRooms } = useMemo(
      () => groupAcademicRooms(allRooms),
      [allRooms],
    );

    const availableRooms = useMemo(
      () =>
        allAvailableRooms.filter(([, room]) =>
          isRoomAvailable(room, filterCriteria),
        ),
      [allAvailableRooms, filterCriteria],
    );

    const libraryRooms = useMemo(
      () =>
        allRooms.filter(([, room]) => isRoomAvailable(room, filterCriteria)),
      [allRooms, filterCriteria],
    );

    const displayedTab = useMemo<RoomTab>(() => {
      if (!isAcademic || !expandedRoomId) {return activeTab;}

      const activeRooms =
        activeTab === "available"
          ? availableRooms
          : activeTab === "occupied"
            ? occupiedRooms
            : allRooms;
      if (activeRooms.some(([roomNumber]) => roomNumber === expandedRoomId)) {
        return activeTab;
      }
      if (availableRooms.some(([roomNumber]) => roomNumber === expandedRoomId)) {
        return "available";
      }
      if (occupiedRooms.some(([roomNumber]) => roomNumber === expandedRoomId)) {
        return "occupied";
      }
      if (allRooms.some(([roomNumber]) => roomNumber === expandedRoomId)) {
        return "all";
      }
      return activeTab;
    }, [
      activeTab,
      allRooms,
      availableRooms,
      expandedRoomId,
      isAcademic,
      occupiedRooms,
    ]);

    const roomsByTab = useMemo(() => {
      if (!isAcademic) {
        if (
          !expandedRoomId ||
          libraryRooms.some(([roomNumber]) => roomNumber === expandedRoomId)
        ) {
          return libraryRooms;
        }
        return allRooms.filter(
          ([roomNumber]) =>
            roomNumber === expandedRoomId ||
            libraryRooms.some(([visibleRoom]) => visibleRoom === roomNumber),
        );
      }
      if (displayedTab === "available") {return availableRooms;}
      if (displayedTab === "occupied") {return occupiedRooms;}
      return allRooms;
    }, [
      isAcademic,
      expandedRoomId,
      displayedTab,
      libraryRooms,
      availableRooms,
      occupiedRooms,
      allRooms,
    ]);

    const roomsToDisplay = useMemo(() => {
      const query = roomSearchQuery.trim().toLowerCase();
      if (!query) {return roomsByTab;}

      return roomsByTab.filter(([roomNumber]) =>
        roomNumber.toLowerCase().includes(query),
      );
    }, [roomsByTab, roomSearchQuery]);

    useLayoutEffect(() => {
      if (!expandedRoomId || !selectedRoomRef.current) {return;}
      selectedRoomRef.current.scrollIntoView({ block: "nearest" });
    }, [expandedRoomId]);

    const selectRoom = (roomId: string | null) => {
      if (roomId === null && expandedRoomId) {
        setActiveTab(displayedTab);
      }
      if (onSelectRoom) {
        onSelectRoom(roomId);
      } else {
        setLocalExpandedRoomId(roomId);
      }
    };

    const selectTab = (tab: RoomTab) => {
      selectRoom(null);
      setActiveTab(tab);
    };

    const totalAvailableCount = availableRooms.length;

    return (
      <div className="w-full pb-8">
        <div className="px-4 py-2.5 border-b border-border/70 bg-card/40">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground leading-snug flex-1 min-w-0">
              {facility.name}
            </h1>

            {onToggleFavorite && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleFavorite}
                className={`h-9 w-9 rounded-full shrink-0 cursor-pointer -mr-1 ${
                  isFavorite
                    ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
                aria-label={
                  isFavorite
                    ? `Remove ${facility.name} from favorites`
                    : `Add ${facility.name} to favorites`
                }
                title={
                  isFavorite
                    ? `Remove ${facility.name} from favorites`
                    : `Add ${facility.name} to favorites`
                }
              >
                <Star
                  className="h-5 w-5"
                  fill={isFavorite ? "currentColor" : "none"}
                />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            {!facility.isOpen ? (
              <Badge
                variant="outline"
                className={`${STATUS_BADGE_STYLES.closed} text-xs font-semibold`}
              >
                CLOSED
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={`${getFacilityAvailabilityBadgeStyle(
                  true,
                  totalAvailableCount,
                )} text-xs font-medium`}
              >
                {totalAvailableCount} of {facility.roomCounts.total} spots available
              </Badge>
            )}

            <span className="text-border" aria-hidden="true">•</span>

            <div className="flex items-center gap-1 min-w-0 truncate">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground/80" />
              <span className="truncate">
                {facility.type === FacilityType.LIBRARY
                  ? "Live LibCal capacity"
                  : facility.hours
                    ? facility.isOpen
                      ? `Open today: ${formatTimeForDisplay(facility.hours.open)} - ${formatTimeForDisplay(facility.hours.close)}`
                      : facility.hours.open
                        ? `Closed • Opens ${formatTimeForDisplay(facility.hours.open)}`
                        : "Not open today"
                    : "University schedule"}
              </span>
            </div>
          </div>
        </div>

        {!facility.isOpen && (
          <div className="m-4 rounded-lg border border-border/80 bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
            {facility.type === FacilityType.LIBRARY ? (
              getLibraryHoursMessage(facility.name)
            ) : (
              <div>
                <p className="font-medium text-foreground">Building is currently closed</p>
                {facility.hours?.open ? (
                  <p className="mt-0.5">
                    Opens at {formatTimeForDisplay(facility.hours.open)}
                  </p>
                ) : (
                  <p className="mt-0.5">Not open today</p>
                )}
              </div>
            )}
          </div>
        )}

        {facility.isOpen && (
          <div>
            {isAcademic && (
              <div className="sticky top-0 bg-background/95 backdrop-blur-xs z-10 px-4 py-2 border-b border-border/50">
                <RoomStatusTabs
                  value={displayedTab}
                  onValueChange={selectTab}
                  counts={{
                    available: availableRooms.length,
                    occupied: occupiedRooms.length,
                    all: allRooms.length,
                  }}
                />
              </div>
            )}

            <div className="divide-y divide-border/50">
              {roomsToDisplay.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-muted-foreground space-y-1">
                  {roomSearchQuery ? (
                    <>
                      <p className="font-medium text-foreground">No matching rooms</p>
                      <p>No rooms match &ldquo;{roomSearchQuery}&rdquo;.</p>
                      {onClearRoomSearch && (
                        <button
                          type="button"
                          onClick={onClearRoomSearch}
                          className="text-primary underline hover:text-primary/80 mt-1 cursor-pointer"
                        >
                          Clear filter
                        </button>
                      )}
                    </>
                  ) : displayedTab === "available" ? (
                    <p>No rooms currently available in this building.</p>
                  ) : displayedTab === "occupied" ? (
                    <p>No rooms currently occupied in this building.</p>
                  ) : (
                    <p>No rooms match your filter criteria.</p>
                  )}
                </div>
              ) : (
                roomsToDisplay.map(([roomNumber, room]) => (
                  <div
                    key={roomNumber}
                    ref={
                      expandedRoomId === roomNumber
                        ? selectedRoomRef
                        : undefined
                    }
                  >
                    <RoomRow
                      roomName={roomNumber}
                      room={room}
                      facilityId={facility.id}
                      facilityName={facility.name}
                      roomDetails={detailsByRoom.get(roomNumber)}
                      isExpanded={expandedRoomId === roomNumber}
                      onToggleExpand={() =>
                        selectRoom(
                          expandedRoomId === roomNumber ? null : roomNumber,
                        )
                      }
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

FacilityDetailPage.displayName = "FacilityDetailPage";

interface FacilityDetailSkeletonProps {
  onBack: () => void;
}

export const FacilityDetailSkeleton: React.FC<FacilityDetailSkeletonProps> = memo(
  ({ onBack }) => {
    useEscapeToBack(onBack);

    return (
      <div className="w-full pb-8" role="status" aria-busy="true" aria-label="Loading facility details">
        <span className="sr-only">Loading facility details…</span>

        <div className="px-4 py-2.5 border-b border-border/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="h-6 w-52 rounded bg-muted animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 rounded-full bg-muted animate-pulse" />
            <div className="h-3 w-32 rounded bg-muted/60 animate-pulse" />
          </div>
        </div>

        <div className="sticky top-0 bg-background/95 z-10 px-4 py-2 border-b border-border/50">
          <div className="h-7 rounded-lg bg-muted/60 animate-pulse" />
        </div>

        <div className="divide-y divide-border/50">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="py-3 px-4 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-3 w-40 rounded bg-muted/60 animate-pulse" />
              </div>
              <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  },
);

FacilityDetailSkeleton.displayName = "FacilityDetailSkeleton";

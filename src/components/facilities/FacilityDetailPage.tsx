import React, { useState, useMemo, memo, useEffect } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RoomRow } from "./RoomRow";
import { RoomStatusTabs, type RoomTab } from "./RoomStatusTabs";
import { groupAcademicRooms } from "./roomUtils";
import { Clock, ExternalLink, Navigation, Star } from "lucide-react";

const ROOM_DETAILS_CACHE_TIME_MS = 10 * 60 * 1000;

export function getGoogleMapsDirectionsUrl(
  latitude: number,
  longitude: number,
): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export function getAppleMapsDirectionsUrl(
  latitude: number,
  longitude: number,
  name: string,
): string {
  return `https://maps.apple.com/?daddr=${latitude},${longitude}&q=${encodeURIComponent(name)}`;
}

interface FacilityDetailPageProps {
  facility: Facility;
  onBack: () => void;
  filterCriteria?: FilterCriteria;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  roomSearchQuery?: string;
  onClearRoomSearch?: () => void;
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
  }) => {
    const isAcademic = facility.type === FacilityType.ACADEMIC;
    const [activeTab, setActiveTab] = useState<RoomTab>("available");
    const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

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

    const roomsByTab = useMemo(() => {
      if (!isAcademic) {return libraryRooms;}
      if (activeTab === "available") {return availableRooms;}
      if (activeTab === "occupied") {return occupiedRooms;}
      return allRooms;
    }, [
      isAcademic,
      activeTab,
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

    const totalAvailableCount = availableRooms.length;

    return (
      <div className="w-full pb-8">
        <div className="px-4 py-2.5 border-b border-border/70 bg-card/40">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground leading-snug flex-1 min-w-0">
              {facility.name}
            </h1>

            <div className="flex items-center gap-1 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full shrink-0 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    aria-label={`Get directions to ${facility.name}`}
                    title="Get directions"
                  >
                    <Navigation className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-56 p-1.5"
                  side="bottom"
                  align="end"
                >
                  <p className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                    Open directions in
                  </p>
                  <a
                    href={getGoogleMapsDirectionsUrl(
                      facility.coordinates.latitude,
                      facility.coordinates.longitude,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted/60"
                    aria-label={`Open directions to ${facility.name} in Google Maps`}
                  >
                    Google Maps
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                  <a
                    href={getAppleMapsDirectionsUrl(
                      facility.coordinates.latitude,
                      facility.coordinates.longitude,
                      facility.name,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted/60"
                    aria-label={`Open directions to ${facility.name} in Apple Maps`}
                  >
                    Apple Maps
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </PopoverContent>
              </Popover>

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
                  value={activeTab}
                  onValueChange={setActiveTab}
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
                  ) : activeTab === "available" ? (
                    <p>No rooms currently available in this building.</p>
                  ) : activeTab === "occupied" ? (
                    <p>No rooms currently occupied in this building.</p>
                  ) : (
                    <p>No rooms match your filter criteria.</p>
                  )}
                </div>
              ) : (
                roomsToDisplay.map(([roomNumber, room]) => (
                  <RoomRow
                    key={roomNumber}
                    roomName={roomNumber}
                    room={room}
                    facilityId={facility.id}
                    facilityName={facility.name}
                    roomDetails={detailsByRoom.get(roomNumber)}
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

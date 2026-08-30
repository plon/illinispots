import React, { useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  FacilityType,
  Facility,
  RoomStatus,
  AcademicRoom,
  LibraryRoom,
  FacilityRoom,
} from "@/types";
import { formatDuration } from "@/utils/format";
import { formatTimeForDisplay } from "@/utils/time";
import {
  RoomBadge,
  STATUS_BADGE_STYLES,
  getFacilityAvailabilityBadgeStyle,
} from "@/components/RoomBadge";
import FacilityRoomDetails from "@/components/FacilityRoomDetails";
import { getLibraryHoursMessage } from "@/utils/libraryHours";
import AcademicRoomDetailLoader from "@/components/AcademicRoomDetailLoader";
import { isRoomAvailable, FilterCriteria } from "@/utils/filterUtils";

interface FacilityAccordionProps {
  facility: Facility;
  facilityType: FacilityType;
  isExpanded: boolean;
  itemRef: (element: HTMLDivElement | null) => void;
  filterCriteria?: FilterCriteria;
}

export const getRoomAvailabilityMessage = (room: LibraryRoom): React.ReactNode => {
  if (room.status === RoomStatus.UNAVAILABLE) {
    return <span className="text-xs text-muted-foreground">Unavailable</span>;
  } else if (room.status === RoomStatus.AVAILABLE) {
    return (
      room.availableFor && (
        <span className="text-xs text-muted-foreground">
          Available for {formatDuration(room.availableFor)}
        </span>
      )
    );
  } else if (room.status === RoomStatus.OPENING_SOON && room.availableAt) {
    return (
      <span className="text-xs text-muted-foreground">
        {`Available at ${formatTimeForDisplay(room.availableAt)}`}
        {room.availableFor ? ` for ${formatDuration(room.availableFor)}` : ""}
      </span>
    );
  } else if (room.availableAt) {
    // Handle case where it's reserved but will be available later
    return (
      <span className="text-xs text-muted-foreground">
        {`Available at ${formatTimeForDisplay(room.availableAt)}`}
        {room.availableFor ? ` for ${formatDuration(room.availableFor)}` : ""}
      </span>
    );
  } else {
    // Reserved with no future availability is fully booked.
    return <span className="text-xs text-muted-foreground">Fully booked</span>;
  }
};

export const FacilityAccordion: React.FC<FacilityAccordionProps> = ({
  facility,
  facilityType,
  isExpanded,
  itemRef,
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

  const handleToggle = () => {
    const isExpanding = !isExpanded;
    if (isExpanding) {
      posthog.capture("facility_accordion_expanded", {
        facility_id: facility.id,
        facility_name: facility.name,
        facility_type: facilityType,
        selection_source: "list",
      });
    }
  };

  return (
    <AccordionItem
      value={facility.id}
      ref={itemRef}
    >
      <div className="sticky top-0 bg-background z-10">
        <AccordionTrigger
          onClick={handleToggle}
          className="px-4 py-2 hover:no-underline hover:bg-muted group"
          aria-label={`${facility.name} details`}
        >
          <span className="sr-only" aria-hidden="true">
            {facility.name}
          </span>
          <div className="flex items-center justify-between flex-1 mr-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-medium truncate">{facility.name}</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              {!facility.isOpen ? (

                <Badge
                  variant="outline"
                  className={STATUS_BADGE_STYLES.closed}
                >
                  CLOSED
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={getFacilityAvailabilityBadgeStyle(
                    true,
                    filteredAvailableCount,
                  )}
                >
                  {filteredAvailableCount}/{facility.roomCounts.total}
                </Badge>
              )}
            </div>
          </div>
        </AccordionTrigger>
      </div>
      <AccordionContent>
        {!facility.isOpen ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            {facilityType === FacilityType.LIBRARY ? (
              getLibraryHoursMessage(facility.name)
            ) : (
              <>
                Building is currently closed
                <br />
                {facility.hours && facility.hours.open ? (
                  <span>Opens {formatTimeForDisplay(facility.hours.open)}</span>
                ) : (
                  <span>Not open today</span>
                )}
              </>
            )}
          </div>
        ) : facilityType === FacilityType.LIBRARY ? (
          <LibraryRoomsAccordion
            facility={facility}
            filterCriteria={filterCriteria}
          />
        ) : (
          <AcademicRoomsAccordion
            facility={facility}
            filterCriteria={filterCriteria}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

interface LibraryRoomsAccordionProps {
  facility: Facility;
  filterCriteria?: FilterCriteria;
}

const LibraryRoomsAccordion: React.FC<LibraryRoomsAccordionProps> = ({
  facility,
  filterCriteria = {},
}) => {
  const posthog = usePostHog();
  const [expandedRooms, setExpandedRooms] = useState<string[]>([]);

  return (
    <Accordion
      type="multiple"
      value={expandedRooms}
      onValueChange={setExpandedRooms}
      className="w-full"
    >
      {Object.entries(facility.rooms)
        .sort(([nameA], [nameB]) => nameA.localeCompare(nameB)) // Sort library rooms by name
        .filter(([, room]) => isRoomAvailable(room, filterCriteria))
        .map(([roomName, room]) => {
          // We know these are library rooms since facility.type is LIBRARY
          const libraryRoom = room as LibraryRoom;
          const roomId = roomName;
          return (
            <AccordionItem
              value={roomId}
              key={roomId}
            >
              {/* Sticky header for room name/status */}
              <div className="sticky top-0 bg-background z-5">
                <AccordionTrigger
                  onClick={() => {
                    const isExpanding = !expandedRooms.includes(roomId);
                    if (isExpanding) {
                      posthog.capture("room_schedule_viewed", {
                        facility_id: facility.id,
                        facility_name: facility.name,
                        facility_type: FacilityType.LIBRARY,
                        room_number: roomName,
                        selection_source: "accordion",
                      });
                    }
                  }}
                  className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
                  aria-label={`${roomName} in ${facility.name}`}
                >
                  <div className="flex items-center justify-between flex-1 mr-2">
                    <div className="flex flex-col items-start text-left">
                      <span className="font-medium">{roomName}</span>
                      {getRoomAvailabilityMessage(libraryRoom)}
                    </div>
                    <RoomBadge
                      status={room.status}
                      availableAt={room.availableAt}
                      availableFor={room.availableFor}
                      facilityType={FacilityType.LIBRARY}
                    />
                  </div>
                </AccordionTrigger>
              </div>
              <AccordionContent>
                <FacilityRoomDetails
                  roomName={roomName}
                  room={libraryRoom}
                  facilityType={FacilityType.LIBRARY}
                  facilityId={facility.id}
                  facilityName={facility.name}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
    </Accordion>
  );
};

interface AcademicRoomsAccordionProps {
  facility: Facility;
  filterCriteria?: FilterCriteria;
}

// --- Helper components for brief room status in trigger ---
const RoomAvailabilityDetails: React.FC<{ room: AcademicRoom }> = ({
  room,
}) => (
  <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
    {room.status === RoomStatus.PASSING_PERIOD && room.nextClass ? (
      <p>
        <span className="font-medium text-foreground/70">Status:</span> Passing
        Period
      </p>
    ) : (
      <>
        {room.availableFor && (
          <p>
            <span className="font-medium text-foreground/70">
              Available for:
            </span>{" "}
            {formatDuration(room.availableFor)}
          </p>
        )}
        {room.availableUntil && (
          <p>
            <span className="font-medium text-foreground/70">Until:</span>{" "}
            {formatTimeForDisplay(room.availableUntil)}
          </p>
        )}
      </>
    )}
    {room.nextClass && (
      <p>
        <span className="font-medium text-foreground/70">Next:</span>{" "}
        {room.nextClass.course} - {room.nextClass.title}
      </p>
    )}
  </div>
);

const RoomOccupancyDetails: React.FC<{ room: AcademicRoom }> = ({ room }) => (
  <div className="text-xs space-y-0.5 mt-0.5">
    {room.currentClass && (
      <p>
        <span className="font-medium text-foreground/70">Current:</span>{" "}
        <span className="font-normal text-muted-foreground">
          {room.currentClass.course} - {room.currentClass.title}
        </span>
      </p>
    )}
    {room.availableAt && (
      <p>
        <span className="font-medium text-foreground/70">Available at:</span>{" "}
        <span className="font-normal text-muted-foreground">
          {formatTimeForDisplay(room.availableAt)}
          {room.availableFor && ` for ${formatDuration(room.availableFor)}`}
        </span>
      </p>
    )}
  </div>
);

const AcademicRoomsAccordion: React.FC<AcademicRoomsAccordionProps> = ({
  facility,
  filterCriteria = {},
}) => {
  const posthog = usePostHog();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Filter available and occupied rooms
  const availableRooms = useMemo(
    () =>
      Object.entries(facility.rooms)
        .filter(
          ([, room]) =>
            (room.status === RoomStatus.AVAILABLE ||
              room.status === RoomStatus.PASSING_PERIOD) &&
            isRoomAvailable(room, filterCriteria)
        )
        .sort(([numA], [numB]) =>
          numA.localeCompare(numB, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
    [facility.rooms, filterCriteria],
  );

  const occupiedRooms = useMemo(
    () =>
      Object.entries(facility.rooms)
        .filter(
          ([, room]) =>
            (room.status === RoomStatus.OCCUPIED ||
              room.status === RoomStatus.OPENING_SOON) &&
            isRoomAvailable(room, filterCriteria)
        )
        .sort(([numA], [numB]) =>
          numA.localeCompare(numB, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
    [facility.rooms, filterCriteria],
  );

  // Function to render the list of rooms within a status group
  const renderRoomList = (
    rooms: [string, FacilityRoom][],
    statusType: "available" | "occupied",
  ) => {
    return (
      <div className="pl-4 pr-1 py-1 space-y-1">
        {" "}
        {/* Indent room list */}
        {rooms.map(([roomNumber, room]) => {
          const academicRoom = room as AcademicRoom;
          return (
            <Accordion
              key={roomNumber}
              type="single"
              collapsible
              onValueChange={(value) => {
                if (!value) return;
                posthog.capture("room_schedule_viewed", {
                  facility_id: facility.id,
                  facility_name: facility.name,
                  facility_type: FacilityType.ACADEMIC,
                  room_number: roomNumber,
                  selection_source: "accordion",
                });
              }}
              className="w-full border-b last:border-b-0"
            >
              <AccordionItem value="details" className="border-b-0">
                <AccordionTrigger
                  className="py-2 px-2 text-sm hover:no-underline hover:bg-muted/20 rounded-md group [&[data-state=open]>svg]:text-primary"
                  aria-label={`Room ${roomNumber} in ${facility.name}`}
                >
                  {/* Room details for the trigger */}
                  <div className="flex justify-between items-center w-full mr-2 text-left">
                    <div className="flex flex-col">
                      <span className="font-medium">{roomNumber}</span>
                      {/* Display brief status details */}
                      {statusType === "available" ? (
                        <RoomAvailabilityDetails room={academicRoom} />
                      ) : (
                        <RoomOccupancyDetails room={academicRoom} />
                      )}
                    </div>
                    <RoomBadge
                      status={academicRoom.status}
                      facilityType={FacilityType.ACADEMIC}
                    />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-0 pb-1 pl-1 pr-4 min-w-0 max-w-full overflow-hidden">
                  <AcademicRoomDetailLoader
                    buildingId={facility.name}
                    roomNumber={roomNumber}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          );
        })}
      </div>
    );
  };

  // Main return uses the Available/Occupied groups
  return (
    <Accordion
      type="multiple"
      value={expandedGroups}
      onValueChange={setExpandedGroups}
      className="w-full"
    >
      {/* Available Rooms Section */}
      <AccordionItem value="available">
        <AccordionTrigger
          onClick={() => {
            const isExpanding = !expandedGroups.includes("available");
            if (isExpanding) {
              posthog.capture("facility_room_group_expanded", {
                facility_id: facility.id,
                facility_name: facility.name,
                facility_type: FacilityType.ACADEMIC,
                group_type: "available",
                room_count: availableRooms.length,
              });
            }
          }}
          className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm font-normal"
          aria-label={`Available rooms in ${facility.name} (${availableRooms.length})`}
        >
          Available Rooms ({availableRooms.length})
        </AccordionTrigger>
        <AccordionContent className="p-0">
          {availableRooms.length > 0 ? (
            renderRoomList(availableRooms, "available")
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No rooms currently available.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* Occupied Rooms Section */}
      <AccordionItem value="occupied">
        <AccordionTrigger
          onClick={() => {
            const isExpanding = !expandedGroups.includes("occupied");
            if (isExpanding) {
              posthog.capture("facility_room_group_expanded", {
                facility_id: facility.id,
                facility_name: facility.name,
                facility_type: FacilityType.ACADEMIC,
                group_type: "occupied",
                room_count: occupiedRooms.length,
              });
            }
          }}
          className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm font-normal"
          aria-label={`Occupied rooms in ${facility.name} (${occupiedRooms.length})`}
        >
          Occupied Rooms ({occupiedRooms.length})
        </AccordionTrigger>
        <AccordionContent className="p-0">
          {occupiedRooms.length > 0 ? (
            renderRoomList(occupiedRooms, "occupied")
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No rooms currently occupied.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default FacilityAccordion;

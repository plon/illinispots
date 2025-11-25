import React, { useMemo } from "react";
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
  AccordionRefs,
  RoomStatus,
  AcademicRoom,
  LibraryRoom,
  FacilityRoom,
} from "@/types";
import { formatTime, formatDuration } from "@/utils/format";
import { RoomBadge } from "@/components/RoomBadge";
import FacilityRoomDetails from "@/components/FacilityRoomDetails";
import { getLibraryHoursMessage } from "@/utils/libraryHours";
import AcademicRoomDetailLoader from "@/components/AcademicRoomDetailLoader";
import { FavoriteButton } from "@/components/FavoriteButton";
import { FavoriteItem } from "@/hooks/useFavorites";
import { isRoomAvailable, FilterCriteria } from "@/utils/filterUtils";

interface FacilityAccordionProps {
  facility: Facility;
  facilityType: FacilityType;
  expandedItems: string[];
  toggleItem: (itemId: string) => void;
  accordionRefs: React.MutableRefObject<AccordionRefs>;
  idPrefix: string;
  isFavorite?: boolean;
  onToggleFavorite?: (item: FavoriteItem) => void;
  filterCriteria?: FilterCriteria;
}

const getRoomAvailabilityMessage = (room: LibraryRoom): React.ReactNode => {
  if (room.status === RoomStatus.AVAILABLE) {
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
        {`Available at ${formatTime(room.availableAt)}`}
        {room.availableFor ? ` for ${formatDuration(room.availableFor)}` : ""}
      </span>
    );
  } else if (room.availableAt) {
    // Handle case where it's reserved but will be available later
    return (
      <span className="text-xs text-muted-foreground">
        {`Available at ${formatTime(room.availableAt)}`}
        {room.availableFor ? ` for ${formatDuration(room.availableFor)}` : ""}
      </span>
    );
  } else {
    // Handle case where it's fully booked with no future availability info
    return <span className="text-xs text-muted-foreground">Fully booked</span>;
  }
};

export const FacilityAccordion: React.FC<FacilityAccordionProps> = ({
  facility,
  facilityType,
  expandedItems,
  toggleItem,
  accordionRefs,
  idPrefix,
  isFavorite = false,
  onToggleFavorite,
  filterCriteria = {},
}) => {
  const facilityId = `${idPrefix}-${facility.id}`;

  const filteredAvailableCount = useMemo(() => {
    return Object.values(facility.rooms).filter((room) => {
      // Allow PASSING_PERIOD for academic rooms if no strict filter, 
      // but isRoomAvailable handles the strict check if criteria exists.
      // We need to match the logic in the child accordions.
      // Academic: (AVAILABLE || PASSING_PERIOD) && isRoomAvailable
      // Library: isRoomAvailable

      // For simplicity and consistency with the "Available" section logic:
      const isAvailableOrPassing =
        room.status === RoomStatus.AVAILABLE ||
        room.status === RoomStatus.PASSING_PERIOD;

      return isAvailableOrPassing && isRoomAvailable(room, filterCriteria);
    }).length;
  }, [facility.rooms, filterCriteria]);

  return (
    <AccordionItem
      value={facilityId}
      key={facilityId}
      ref={(el) => {
        accordionRefs.current[facilityId] = el;
      }}
    >
      <div className="sticky top-0 bg-background z-10">
        <AccordionTrigger
          onClick={() => toggleItem(facilityId)}
          className="px-4 py-2 hover:no-underline hover:bg-muted group"
        >
          <div className="flex items-center justify-between flex-1 mr-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-semibold">{facility.name}</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              {onToggleFavorite && (
                <FavoriteButton
                  facility={{
                    id: facility.id,
                    name: facility.name,
                    type: facilityType === FacilityType.LIBRARY ? 'library' : 'academic',
                  }}
                  isFavorite={isFavorite}
                  onToggle={onToggleFavorite}
                  size="sm"
                />
              )}
              {!facility.isOpen ? (
                <Badge
                  variant="outline"
                  className="bg-gray-50 text-gray-700 border-gray-300"
                >
                  CLOSED
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={`${filteredAvailableCount > 0
                      ? "bg-green-50 text-green-700 border-green-300"
                      : "bg-red-50 text-red-700 border-red-300"
                    }`}
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
                  <span>Opens {formatTime(facility.hours.open)}</span>
                ) : (
                  <span>Not open today</span>
                )}
              </>
            )}
          </div>
        ) : facilityType === FacilityType.LIBRARY ? (
          <LibraryRoomsAccordion
            facility={facility}
            expandedItems={expandedItems}
            toggleItem={toggleItem}
            accordionRefs={accordionRefs}
            idPrefix={idPrefix}
            filterCriteria={filterCriteria}
          />
        ) : (
          <AcademicRoomsAccordion
            facility={facility}
            expandedItems={expandedItems}
            toggleItem={toggleItem}
            accordionRefs={accordionRefs}
            idPrefix={idPrefix}
            filterCriteria={filterCriteria}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

interface LibraryRoomsAccordionProps {
  facility: Facility;
  expandedItems: string[];
  toggleItem: (itemId: string) => void;
  accordionRefs: React.MutableRefObject<AccordionRefs>;
  idPrefix: string;
  filterCriteria?: FilterCriteria;
}

const LibraryRoomsAccordion: React.FC<LibraryRoomsAccordionProps> = ({
  facility,
  expandedItems,
  toggleItem,
  accordionRefs,
  idPrefix,
  filterCriteria = {},
}) => {
  return (
    <Accordion type="multiple" value={expandedItems} className="w-full">
      {Object.entries(facility.rooms)
        .sort(([nameA], [nameB]) => nameA.localeCompare(nameB)) // Sort library rooms by name
        .filter(([, room]) => isRoomAvailable(room, filterCriteria))
        .map(([roomName, room]) => {
          // We know these are library rooms since facility.type is LIBRARY
          const libraryRoom = room as LibraryRoom;
          const roomId = `${idPrefix}-${facility.id}-room-${roomName}`;
          return (
            <AccordionItem
              value={roomId}
              key={roomId}
              ref={(el) => {
                accordionRefs.current[roomId] = el; // Assign ref for potential scrolling
              }}
            >
              {/* Sticky header for room name/status */}
              <div className="sticky top-0 bg-background z-5">
                <AccordionTrigger
                  onClick={() => toggleItem(roomId)}
                  className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
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
  expandedItems: string[];
  toggleItem: (itemId: string) => void;
  accordionRefs: React.MutableRefObject<AccordionRefs>;
  idPrefix: string;
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
            {formatTime(room.availableUntil)}
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
        <span className="font-normal text-gray-500">
          {room.currentClass.course} - {room.currentClass.title}
        </span>
      </p>
    )}
    {room.availableAt && (
      <p>
        <span className="font-medium text-foreground/70">Available at:</span>{" "}
        <span className="font-normal text-gray-500">
          {formatTime(room.availableAt)}
          {room.availableFor && ` for ${formatDuration(room.availableFor)}`}
        </span>
      </p>
    )}
  </div>
);

const AcademicRoomsAccordion: React.FC<AcademicRoomsAccordionProps> = ({
  facility,
  expandedItems,
  toggleItem,
  accordionRefs, // Refs might need adjustment for deep nesting if scrolling to specific room is needed
  idPrefix,
  filterCriteria = {},
}) => {
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
          const roomAccordionId = `${idPrefix}-${facility.id}-${statusType}-room-${roomNumber}`;
          const isRoomExpanded = expandedItems.includes(roomAccordionId);

          return (
            // Nest Accordion for each room
            <Accordion
              key={roomAccordionId}
              type="multiple"
              value={expandedItems}
              className="w-full border-b last:border-b-0"
            >
              <AccordionItem value={roomAccordionId} className="border-b-0">
                <AccordionTrigger
                  onClick={() => toggleItem(roomAccordionId)}
                  className="py-2 px-2 text-sm hover:no-underline hover:bg-muted/20 rounded-md group [&[data-state=open]>svg]:text-primary"
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
                <AccordionContent className="pt-0 pb-1 pl-1 pr-4">
                  {/* Conditionally render loader only when this specific room is expanded */}
                  {isRoomExpanded ? (
                    <AcademicRoomDetailLoader
                      buildingId={facility.name} // Use facility name as ID for API call
                      roomNumber={roomNumber}
                    />
                  ) : (
                    // Placeholder so content area doesn't collapse instantly
                    <div className="h-10"></div>
                  )}
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
    <Accordion type="multiple" value={expandedItems} className="w-full">
      {/* Available Rooms Section */}
      <AccordionItem
        value={`${idPrefix}-${facility.id}-available`}
        ref={(el) => {
          accordionRefs.current[`${idPrefix}-${facility.id}-available`] = el;
        }}
      >
        <AccordionTrigger
          onClick={() => toggleItem(`${idPrefix}-${facility.id}-available`)}
          className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
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
      <AccordionItem
        value={`${idPrefix}-${facility.id}-occupied`}
        ref={(el) => {
          accordionRefs.current[`${idPrefix}-${facility.id}-occupied`] = el;
        }}
      >
        <AccordionTrigger
          onClick={() => toggleItem(`${idPrefix}-${facility.id}-occupied`)}
          className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
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

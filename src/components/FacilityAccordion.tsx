import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { FacilityType, Facility, AccordionRefs, RoomStatus } from "@/types";
import { formatTime, formatDuration } from "@/utils/format";
import { RoomBadge } from "@/components/RoomBadge";
import FacilityRoomDetails from "@/components/FacilityRoomDetails";
import { getLibraryHoursMessage } from "@/utils/libraryHours";

interface FacilityAccordionProps {
  facility: Facility;
  facilityType: FacilityType;
  expandedItems: string[];
  toggleItem: (itemId: string) => void;
  accordionRefs: React.MutableRefObject<AccordionRefs>;
  idPrefix: string;
}

export const FacilityAccordion: React.FC<FacilityAccordionProps> = ({
  facility,
  facilityType,
  expandedItems,
  toggleItem,
  accordionRefs,
  idPrefix,
}) => {
  const facilityId = `${idPrefix}-${facility.id}`;

  return (
    <AccordionItem
      value={facilityId}
      key={facilityId}
      ref={(el) => {
        accordionRefs.current[facilityId] = el;
      }}
    >
      <AccordionTrigger
        onClick={() => toggleItem(facilityId)}
        className="px-4 py-2 hover:no-underline hover:bg-muted group"
      >
        <div className="flex items-center justify-between flex-1 mr-2">
          <span>{facility.name}</span>
          <div className="ml-2">
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
                className={`${
                  facility.roomCounts.available > 0
                    ? "bg-green-50 text-green-700 border-green-300"
                    : "bg-red-50 text-red-700 border-red-300"
                }`}
              >
                {facility.roomCounts.available}/{facility.roomCounts.total}
              </Badge>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {!facility.isOpen ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            {facilityType === FacilityType.LIBRARY ? (
              getLibraryHoursMessage(facility.name)
            ) : (
              <>
                Building is currently closed
                <br />
                <span>Opens {formatTime(facility.hours.open)}</span>
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
          />
        ) : (
          <AcademicRoomsAccordion
            facility={facility}
            expandedItems={expandedItems}
            toggleItem={toggleItem}
            accordionRefs={accordionRefs}
            idPrefix={idPrefix}
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
}

const LibraryRoomsAccordion: React.FC<LibraryRoomsAccordionProps> = ({
  facility,
  expandedItems,
  toggleItem,
  accordionRefs,
  idPrefix,
}) => {
  return (
    <Accordion type="multiple" value={expandedItems} className="w-full">
      {Object.entries(facility.rooms).map(([roomName, room]) => {
        const roomId = `${idPrefix}-${facility.id}-room-${roomName}`;
        return (
          <AccordionItem
            value={roomId}
            key={roomId}
            ref={(el) => {
              accordionRefs.current[roomId] = el;
            }}
          >
            <AccordionTrigger
              onClick={() => toggleItem(roomId)}
              className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
            >
              <div className="flex items-center justify-between flex-1 mr-2">
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium">{roomName}</span>
                  {room.status === RoomStatus.AVAILABLE ? (
                    room.availableFor && (
                      <span className="text-xs text-muted-foreground">
                        Available for {formatDuration(room.availableFor)}
                      </span>
                    )
                  ) : room.status === RoomStatus.OPENING_SOON &&
                    room.availableAt ? (
                    <span className="text-xs text-muted-foreground">
                      {`Available at ${formatTime(room.availableAt)}`}
                      {room.availableFor
                        ? ` for ${formatDuration(room.availableFor)}`
                        : ""}
                    </span>
                  ) : room.availableAt ? (
                    <span className="text-xs text-muted-foreground">
                      {`Available at ${formatTime(room.availableAt)}`}
                      {room.availableFor
                        ? ` for ${formatDuration(room.availableFor)}`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Fully booked
                    </span>
                  )}
                </div>
                <RoomBadge
                  status={room.status}
                  availableAt={room.availableAt}
                  availableFor={room.availableFor}
                  facilityType={FacilityType.LIBRARY}
                />
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <FacilityRoomDetails
                roomName={roomName}
                room={room}
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
}

const AcademicRoomsAccordion: React.FC<AcademicRoomsAccordionProps> = ({
  facility,
  expandedItems,
  toggleItem,
  accordionRefs,
  idPrefix,
}) => {
  // Filter available and occupied rooms
  const availableRooms = Object.entries(facility.rooms).filter(
    ([, room]) =>
      room.status === RoomStatus.AVAILABLE ||
      room.status === RoomStatus.PASSING_PERIOD,
  );

  const occupiedRooms = Object.entries(facility.rooms).filter(
    ([, room]) =>
      room.status === RoomStatus.OCCUPIED ||
      room.status === RoomStatus.OPENING_SOON,
  );

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
        <AccordionContent>
          <div className="px-4 py-2 space-y-2">
            {availableRooms.map(([roomNumber, room]) => (
              <div key={roomNumber} className="text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{roomNumber}</span>
                  <RoomBadge
                    status={room.status}
                    availableFor={room.availableFor}
                    facilityType={FacilityType.ACADEMIC}
                  />
                </div>
                {room.status === RoomStatus.PASSING_PERIOD && room.nextClass ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">
                      Next:
                    </span>{" "}
                    {room.nextClass.course} - {room.nextClass.title} at{" "}
                    {formatTime(room.nextClass.time.start)}
                  </p>
                ) : (
                  <>
                    {room.availableFor && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">
                          Available for:
                        </span>{" "}
                        {formatDuration(room.availableFor)}
                      </p>
                    )}
                    {room.availableUntil && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">
                          Until:
                        </span>{" "}
                        {formatTime(room.availableUntil)}
                      </p>
                    )}
                    {room.nextClass && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">
                          Next:
                        </span>{" "}
                        {room.nextClass.course} - {room.nextClass.title}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
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
        <AccordionContent>
          <div className="px-4 py-2 space-y-2">
            {occupiedRooms.map(([roomNumber, room]) => (
              <div key={roomNumber} className="text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{roomNumber}</span>
                  <RoomBadge
                    status={room.status}
                    availableAt={room.availableAt}
                    availableFor={room.availableFor}
                    facilityType={FacilityType.ACADEMIC}
                  />
                </div>
                {room.currentClass && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/70">
                      Current:
                    </span>{" "}
                    {room.currentClass.course} - {room.currentClass.title}
                  </p>
                )}
                {room.availableAt && (
                  <div className="text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground/70">
                        Available at:
                      </span>{" "}
                      {formatTime(room.availableAt)}
                      {room.availableFor && (
                        <span className="ml-1">
                          for {formatDuration(room.availableFor)}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default FacilityAccordion;

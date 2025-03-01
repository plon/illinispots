"use client";

import React, {
  useRef,
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BuildingStatus, APIResponse, TimeSlot, AccordionRefs } from "@/types";
import moment from "moment-timezone";
import { Github, Map, TriangleAlert } from "lucide-react";
import LibraryRoomAvailability from "@/components/LibraryRoomAvailability";
import { getLibraryHoursMessage } from "@/utils/libraryHours";

const formatTime = (time: string | undefined): string => {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const formatDuration = (minutes: number | undefined): string => {
  if (!minutes) return "";
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const RoomBadge: React.FC<{
  availableAt?: string;
  availableFor?: number;
  available: boolean;
  passingPeriod?: boolean;
  isLibrary?: boolean;
}> = memo(
  ({ availableAt, availableFor, available, passingPeriod, isLibrary }) => {
    const isOpening = useMemo(() => {
      if (!availableAt || !availableFor) return false;
      const [availableHours, availableMinutes] = availableAt.split(":");
      const now = moment().tz("America/Chicago");
      const availableTime = moment()
        .tz("America/Chicago")
        .hours(parseInt(availableHours, 10))
        .minutes(parseInt(availableMinutes, 10))
        .seconds(0);
      const diffInMinutes = availableTime.diff(now, "minutes");
      return diffInMinutes <= 20 && diffInMinutes > 0 && availableFor >= 30;
    }, [availableAt, availableFor]);

    return (
      <Badge
        variant="outline"
        className={`${
          available
            ? passingPeriod
              ? "bg-gray-50 text-gray-700 border-gray-300"
              : "bg-green-50 text-green-700 border-green-300"
            : isOpening
              ? "bg-yellow-50 text-yellow-700 border-yellow-300"
              : "bg-red-50 text-red-700 border-red-300"
        }`}
      >
        {available
          ? passingPeriod
            ? "Passing Period"
            : "Available"
          : isOpening
            ? "Opening Soon"
            : isLibrary
              ? "Reserved"
              : "Occupied"}
      </Badge>
    );
  },
);

RoomBadge.displayName = "RoomBadge";

const isLibraryRoomAvailable = (slots: TimeSlot[]): boolean => {
  const currentMoment = moment().tz("America/Chicago");
  const currentTime = currentMoment.format("HH:mm:ss");

  const todaySlot = slots.find((slot) => {
    // If time is between midnight and 2am, check if this is a continuation from previous day
    if (currentTime < "02:00:00" && slot.start > "20:00:00") {
      return false; // previous day's slot
    }
    if (currentTime > "20:00:00" && slot.start < "02:00:00") {
      return false; // next day's slot
    }
    return slot.start <= currentTime && slot.end > currentTime;
  });

  return todaySlot ? todaySlot.available : false;
};

interface LeftSidebarProps {
  buildingData: BuildingStatus | null;
  libraryData: APIResponse | null;
  showMap: boolean;
  setShowMap: Dispatch<SetStateAction<boolean>>;
  expandedItems: string[];
  setExpandedItems: Dispatch<SetStateAction<string[]>>;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  buildingData,
  libraryData,
  showMap,
  setShowMap,
  expandedItems,
  setExpandedItems,
}) => {
  const accordionRefs = useRef<AccordionRefs>({});
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const scrollToAccordion = useCallback((accordionId: string) => {
    const element = accordionRefs.current[accordionId];
    if (element) {
      setTimeout(() => {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  }, []);

  const toggleItem = useCallback(
    (itemId: string) => {
      setExpandedItems((prev) => {
        if (prev.includes(itemId)) {
          return prev.filter((item) => item !== itemId);
        } else {
          return [...prev, itemId];
        }
      });
    },
    [setExpandedItems],
  );

  const prevExpandedItemsRef = useRef<string[]>([]);

  useEffect(() => {
    const addedItems = expandedItems.filter(
      (item) => !prevExpandedItemsRef.current.includes(item),
    );
    if (addedItems.length > 0) {
      scrollToAccordion(addedItems[0]);
    }
    prevExpandedItemsRef.current = expandedItems;
  }, [expandedItems, scrollToAccordion]);

  return (
    <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col">
      <div className="py-1 pl-3 pr-3 md:p-4 border-b flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            <span style={{ color: "#FF5F05" }}>illini</span>
            <span style={{ color: "#13294B" }}>Spots</span>
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Find available study spaces
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <a
            href="https://github.com/plon/illinispots"
            target="_blank"
            rel="noopener noreferrer"
            className="h-6 w-6 md:h-8 md:w-8 rounded-full flex items-center justify-center border-2 border-foreground/20 hover:bg-muted"
          >
            <Github size={14.5} />
          </a>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold"
              >
                <TriangleAlert size={12} />
                <span className="sr-only">Warning about room availability</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="text-sm space-y-2">
                <p className="font-medium">Important Notes:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Building/room access may be restricted to specific colleges
                    or departments
                  </li>
                  <li>
                    Displayed availability only reflects official class
                    schedules
                  </li>
                  <li>
                    Rooms may be occupied by unofficial meetings or study groups
                  </li>
                  <li>Different schedules may apply during exam periods</li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className={`h-6 w-6 md:h-8 md:w-8 rounded-full border-2 border-foreground/20 font-bold ${
              showMap ? "bg-muted" : ""
            }`}
            onClick={() => setShowMap(!showMap)}
          >
            <Map size={12} />
            <span className="sr-only">Toggle map visibility</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        {/* Libraries Accordion */}
        <Accordion type="multiple" value={expandedItems} className="w-full">
          {libraryData &&
            Object.entries(libraryData.data)
              .sort()
              .map(([libraryName, library]) => (
                <AccordionItem
                  value={`library-${libraryName}`}
                  key={`library-${libraryName}`}
                  ref={(el) => {
                    accordionRefs.current[`library-${libraryName}`] = el;
                  }}
                >
                  <AccordionTrigger
                    onClick={() => toggleItem(`library-${libraryName}`)}
                    className="px-4 py-2 hover:no-underline hover:bg-muted group"
                  >
                    <div className="flex items-center justify-between flex-1 mr-2">
                      <span>{libraryName}</span>
                      <div className="ml-2">
                        {!library.isOpen ? (
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
                              library.currently_available > 0
                                ? "bg-green-50 text-green-700 border-green-300"
                                : "bg-red-50 text-red-700 border-red-300"
                            }`}
                          >
                            {library.currently_available}/{library.room_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {!library.isOpen ? (
                      <div className="px-4 py-2 text-sm text-muted-foreground">
                        {getLibraryHoursMessage(libraryName)}
                      </div>
                    ) : (
                      <Accordion
                        type="multiple"
                        value={expandedItems}
                        className="w-full"
                      >
                        {Object.entries(library.rooms).map(
                          ([roomName, room]) => (
                            <AccordionItem
                              value={`library-${libraryName}-room-${roomName}`}
                              key={`library-${libraryName}-room-${roomName}`}
                              ref={(el) => {
                                accordionRefs.current[
                                  `library-${libraryName}-room-${roomName}`
                                ] = el;
                              }}
                            >
                              <AccordionTrigger
                                onClick={() =>
                                  toggleItem(
                                    `library-${libraryName}-room-${roomName}`,
                                  )
                                }
                                className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
                              >
                                <div className="flex items-center justify-between flex-1 mr-2">
                                  <div className="flex flex-col items-start text-left">
                                    <span className="font-medium">
                                      {roomName}
                                    </span>
                                    {isLibraryRoomAvailable(room.slots) ? (
                                      room.available_duration && (
                                        <span className="text-xs text-muted-foreground">
                                          Available for{" "}
                                          {formatDuration(
                                            room.available_duration,
                                          )}
                                        </span>
                                      )
                                    ) : room.nextAvailable ? (
                                      <span className="text-xs text-muted-foreground">
                                        {`Available at ${formatTime(room.nextAvailable)}`}
                                        {room.available_duration
                                          ? ` for ${formatDuration(room.available_duration)}`
                                          : ""}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        Fully booked
                                      </span>
                                    )}
                                  </div>
                                  <RoomBadge
                                    available={isLibraryRoomAvailable(
                                      room.slots,
                                    )}
                                    availableAt={
                                      room.nextAvailable || undefined
                                    }
                                    availableFor={room.available_duration}
                                    isLibrary={true}
                                  />
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <LibraryRoomAvailability
                                  roomName={roomName}
                                  room={room}
                                />
                              </AccordionContent>
                            </AccordionItem>
                          ),
                        )}
                      </Accordion>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
        </Accordion>

        {/* Buildings Accordion */}
        <Accordion type="multiple" value={expandedItems} className="w-full">
          {buildingData &&
            Object.entries(buildingData.buildings)
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([, building]) => (
                <AccordionItem
                  value={`building-${building.name}`}
                  key={`building-${building.name}`}
                  ref={(el) => {
                    accordionRefs.current[`building-${building.name}`] = el;
                  }}
                >
                  <AccordionTrigger
                    onClick={() => toggleItem(`building-${building.name}`)}
                    className="px-4 py-2 hover:no-underline hover:bg-muted group"
                  >
                    <div className="flex items-center justify-between flex-1 mr-2">
                      <span>{building.name}</span>
                      {!building.isOpen ? (
                        <Badge
                          variant="outline"
                          className="bg-gray-50 text-gray-700 border-gray-300"
                        >
                          CLOSED
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`
                                                          ${
                                                            Object.values(
                                                              building.rooms ||
                                                                {},
                                                            ).filter(
                                                              (room) =>
                                                                room?.available,
                                                            ).length > 0
                                                              ? "bg-green-50 text-green-700 border-green-300"
                                                              : "bg-red-50 text-red-700 border-red-300"
                                                          }
                                                        `}
                        >
                          {
                            Object.values(building.rooms || {}).filter(
                              (room) => room?.available,
                            ).length
                          }
                          /{Object.keys(building.rooms || {}).length}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {!building.isOpen ? (
                      <div className="px-4 py-2 text-sm text-muted-foreground">
                        Building is currently closed
                      </div>
                    ) : (
                      <Accordion
                        type="multiple"
                        value={expandedItems}
                        className="w-full"
                      >
                        {/* Available Rooms Section */}
                        <AccordionItem
                          value={`building-${building.name}-available`}
                          ref={(el) => {
                            accordionRefs.current[
                              `building-${building.name}-available`
                            ] = el;
                          }}
                        >
                          <AccordionTrigger
                            onClick={() =>
                              toggleItem(`building-${building.name}-available`)
                            }
                            className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
                          >
                            Available Rooms (
                            {
                              Object.values(building.rooms).filter(
                                (room) => room.available,
                              ).length
                            }
                            )
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="px-4 py-2 space-y-2">
                              {Object.entries(building.rooms)
                                .filter(([, room]) => room.available)
                                .map(([roomNumber, room]) => (
                                  <div key={roomNumber} className="text-sm">
                                    <div className="flex justify-between items-center">
                                      <span className="font-medium">
                                        {roomNumber}
                                      </span>
                                      <RoomBadge
                                        available={true}
                                        availableFor={room.availableFor}
                                        passingPeriod={room.passingPeriod}
                                        isLibrary={false}
                                      />
                                    </div>
                                    {room.passingPeriod && room.nextClass ? (
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground/70">
                                          Next:
                                        </span>{" "}
                                        {room.nextClass.course} -{" "}
                                        {room.nextClass.title} at{" "}
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
                                            {room.nextClass.course} -{" "}
                                            {room.nextClass.title}
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
                          value={`building-${building.name}-occupied`}
                          ref={(el) => {
                            accordionRefs.current[
                              `building-${building.name}-occupied`
                            ] = el;
                          }}
                        >
                          <AccordionTrigger
                            onClick={() =>
                              toggleItem(`building-${building.name}-occupied`)
                            }
                            className="px-4 py-2 hover:no-underline hover:bg-muted/50 text-sm"
                          >
                            Occupied Rooms (
                            {
                              Object.values(building.rooms).filter(
                                (room) => !room.available,
                              ).length
                            }
                            )
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="px-4 py-2 space-y-2">
                              {Object.entries(building.rooms)
                                .filter(([, room]) => !room.available)
                                .map(([roomNumber, room]) => (
                                  <div key={roomNumber} className="text-sm">
                                    <div className="flex justify-between items-center">
                                      <span className="font-medium">
                                        {roomNumber}
                                      </span>
                                      <RoomBadge
                                        available={false}
                                        availableAt={room.availableAt}
                                        availableFor={room.availableFor}
                                        isLibrary={false}
                                      />
                                    </div>
                                    {room.currentClass && (
                                      <p className="text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground/70">
                                          Current:
                                        </span>{" "}
                                        {room.currentClass.course} -{" "}
                                        {room.currentClass.title}
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
                                              for{" "}
                                              {formatDuration(
                                                room.availableFor,
                                              )}
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
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
        </Accordion>
      </ScrollArea>
    </div>
  );
};

LeftSidebar.displayName = "LeftSidebar";

export default memo(LeftSidebar);

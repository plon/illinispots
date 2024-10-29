"use client";

import { useState, useEffect, useRef, Dispatch, SetStateAction } from "react";
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
import { BuildingStatus } from "@/types";
import moment from "moment-timezone";

const formatTime = (time: string | undefined): string => {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const MINIMUM_USEFUL_TIME = 30; // minimum minutes needed for the room to be useful

const isOpeningSoon = (
  availableAt: string | undefined,
  nextClassStart: string | undefined,
): boolean => {
  if (!availableAt) return false;

  const [hours, minutes] = availableAt.split(":");
  const now = moment().utc().tz("America/Chicago");
  const availableTime = moment()
    .utc()
    .tz("America/Chicago")
    .hours(parseInt(hours, 10))
    .minutes(parseInt(minutes, 10))
    .seconds(0);

  // If there's no next class, just check if it's available within 20 minutes
  if (!nextClassStart) {
    const diffInMinutes = availableTime.diff(now, "minutes");
    return diffInMinutes > 0 && diffInMinutes <= 20;
  }

  // Calculate available duration until next class
  const [nextHours, nextMinutes] = nextClassStart.split(":");
  const nextClassTime = moment()
    .utc()
    .tz("America/Chicago")
    .hours(parseInt(nextHours, 10))
    .minutes(parseInt(nextMinutes, 10))
    .seconds(0);

  const availableDuration = nextClassTime.diff(availableTime, "minutes");
  const diffInMinutes = availableTime.diff(now, "minutes");

  // Only show "Opening Soon" if:
  // 1. The room will be available within 20 minutes
  // 2. There will be at least MINIMUM_USEFUL_TIME minutes until the next class
  return (
    diffInMinutes > 0 &&
    diffInMinutes <= 20 &&
    availableDuration >= MINIMUM_USEFUL_TIME
  );
};

interface LeftSidebarProps {
  buildingData: BuildingStatus | null;
  loading: boolean;
  expandedBuildings: string[];
  setExpandedBuildings: Dispatch<SetStateAction<string[]>>;
}

export default function LeftSidebar({
  buildingData,
  loading,
  expandedBuildings,
  setExpandedBuildings,
}: LeftSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const accordionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const lastExpanded = expandedBuildings[expandedBuildings.length - 1];
    if (lastExpanded && accordionRefs.current[lastExpanded]) {
      const element = accordionRefs.current[lastExpanded];
      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  }, [expandedBuildings]);

  const toggleBuilding = (building: string) => {
    setExpandedBuildings((prev: string[]) =>
      prev.includes(building)
        ? prev.filter((b) => b !== building)
        : [...prev, building],
    );
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev: string[]) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section],
    );
  };

  if (loading) {
    return (
      <div className="h-full bg-background border-t md:border-t-0 md:border-l p-4">
        <div className="h-12 bg-muted animate-pulse rounded-md mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-background border-t md:border-t-0 md:border-l flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">
            <span style={{ color: "#FF5F05" }}>illini</span>
            <span style={{ color: "#13294B" }}>Spots</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Find available study spaces
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="https://github.com/plon/illinispots"
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 w-8 rounded-full flex items-center justify-center border-2 border-foreground/20 hover:bg-muted"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </a>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full border-2 border-foreground/20 font-bold"
              >
                !
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
        </div>
      </div>
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <Accordion type="multiple" value={expandedBuildings} className="w-full">
          {buildingData &&
            Object.entries(buildingData.buildings)
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([, building]) => (
                <AccordionItem
                  value={building.name}
                  key={building.name}
                  ref={(el) => {
                    if (el) {
                      accordionRefs.current[building.name] = el;
                    }
                  }}
                >
                  <AccordionTrigger
                    onClick={() => toggleBuilding(building.name)}
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
                              Object.values(building.rooms || {}).filter(
                                (room) => room?.available,
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
                        value={expandedSections}
                        className="w-full"
                      >
                        {/* Available Rooms Section */}
                        <AccordionItem value={`${building.name}-available`}>
                          <AccordionTrigger
                            onClick={() =>
                              toggleSection(`${building.name}-available`)
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
                                      <Badge
                                        variant="outline"
                                        className="bg-green-50 text-green-700 border-green-300"
                                      >
                                        Available
                                      </Badge>
                                    </div>
                                    {room.nextClass && (
                                      <p className="text-xs text-muted-foreground">
                                        Next: {room.nextClass.course} at{" "}
                                        {formatTime(room.nextClass.time.start)}
                                      </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      Available until:{" "}
                                      {room.availableUntil
                                        ? formatTime(room.availableUntil)
                                        : "End of day"}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        {/* Occupied Rooms Section */}
                        <AccordionItem value={`${building.name}-occupied`}>
                          <AccordionTrigger
                            onClick={() =>
                              toggleSection(`${building.name}-occupied`)
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
                                      <Badge
                                        variant="outline"
                                        className="bg-red-50 text-red-700 border-red-300"
                                      >
                                        {room.currentClass
                                          ? "Occupied"
                                          : "Passing Period"}
                                      </Badge>
                                    </div>
                                    {room.currentClass ? (
                                      <>
                                        <p className="text-xs text-muted-foreground">
                                          Current: {room.currentClass.course} -{" "}
                                          {room.currentClass.title}
                                        </p>
                                        {room.nextClass ? (
                                          moment(
                                            room.nextClass.time.start,
                                            "HH:mm",
                                          ).diff(
                                            moment(
                                              room.currentClass.time.end,
                                              "HH:mm",
                                            ),
                                            "minutes",
                                          ) < 15 ? (
                                            <p className="text-xs text-muted-foreground">
                                              Next class:{" "}
                                              {room.nextClass.course} at{" "}
                                              {formatTime(
                                                room.nextClass.time.start,
                                              )}
                                            </p>
                                          ) : (
                                            <p className="text-xs text-muted-foreground">
                                              Available at:{" "}
                                              {formatTime(
                                                room.currentClass.time.end,
                                              )}
                                            </p>
                                          )
                                        ) : (
                                          <p className="text-xs text-muted-foreground">
                                            Available at:{" "}
                                            {formatTime(
                                              room.currentClass.time.end,
                                            )}
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      room.nextClass && (
                                        <p className="text-xs text-muted-foreground">
                                          Next class: {room.nextClass.course} at{" "}
                                          {formatTime(
                                            room.nextClass.time.start,
                                          )}
                                        </p>
                                      )
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
}

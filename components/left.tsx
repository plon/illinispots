"use client";

import {
  useState,
  useRef,
  Dispatch,
  SetStateAction,
  useLayoutEffect,
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
import { BuildingStatus } from "@/types";
import moment from "moment-timezone";
import { Github, Map, TriangleAlert } from "lucide-react";

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

const isOpeningSoon = (
  availableAt: string | undefined,
  availableFor: number | undefined,
): boolean => {
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
};

interface LeftSidebarProps {
  buildingData: BuildingStatus | null;
  loading: boolean;
  expandedBuildings: string[];
  setExpandedBuildings: Dispatch<SetStateAction<string[]>>;
  showMap: boolean;
  setShowMap: Dispatch<SetStateAction<boolean>>;
}

// Create a type for accordion refs to improve type safety
type AccordionRefs = {
  [key: string]: HTMLDivElement | null;
};

export default function LeftSidebar({
  buildingData,
  loading,
  expandedBuildings,
  setExpandedBuildings,
  showMap,
  setShowMap,
}: LeftSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [lastExpandedBuilding, setLastExpandedBuilding] = useState<
    string | null
  >(null);
  const [lastExpandedSection, setLastExpandedSection] = useState<string | null>(
    null,
  );
  const accordionRefs = useRef<AccordionRefs>({});
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const scrollToAccordion = (accordionId: string) => {
    const element = accordionRefs.current[accordionId];
    if (element) {
      setTimeout(() => {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  };

  useLayoutEffect(() => {
    if (lastExpandedBuilding) {
      scrollToAccordion(lastExpandedBuilding);
      setLastExpandedBuilding(null);
    } else if (lastExpandedSection) {
      scrollToAccordion(lastExpandedSection);
      setLastExpandedSection(null);
    }
  }, [lastExpandedBuilding, lastExpandedSection]);

  const toggleBuilding = (building: string) => {
    setExpandedBuildings((prev) => {
      if (prev.includes(building)) {
        // It's being collapsed
        return prev.filter((b) => b !== building);
      } else {
        // It's being expanded
        setLastExpandedBuilding(building);
        return [...prev, building];
      }
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      if (prev.includes(section)) {
        // It's being collapsed
        return prev.filter((s) => s !== section);
      } else {
        setLastExpandedSection(section);
        return [...prev, section];
      }
    });
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
          {/* Button to toggle map visibility */}
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
        <Accordion type="multiple" value={expandedBuildings} className="w-full">
          {buildingData &&
            Object.entries(buildingData.buildings)
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([, building]) => (
                <AccordionItem
                  value={building.name}
                  key={building.name}
                  ref={(el) => {
                    accordionRefs.current[building.name] = el;
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
                        <AccordionItem
                          value={`${building.name}-available`}
                          ref={(el) => {
                            accordionRefs.current[
                              `${building.name}-available`
                            ] = el;
                          }}
                        >
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
                                        className={`
                                          ${
                                            room.passingPeriod
                                              ? "bg-gray-50 text-gray-700 border-gray-300"
                                              : "bg-green-50 text-green-700 border-green-300"
                                          }
                                        `}
                                      >
                                        {room.passingPeriod
                                          ? "Passing Period"
                                          : "Available"}
                                      </Badge>
                                    </div>
                                    {room.passingPeriod && room.nextClass ? (
                                      <p className="text-xs text-muted-foreground">
                                        {room.nextClass.course} -{" "}
                                        {room.nextClass.title} at{" "}
                                        {formatTime(room.nextClass.time.start)}
                                      </p>
                                    ) : (
                                      <>
                                        {room.availableFor && (
                                          <p className="text-xs text-muted-foreground">
                                            Available for{" "}
                                            {formatDuration(room.availableFor)}
                                          </p>
                                        )}
                                        {room.availableUntil && (
                                          <p className="text-xs text-muted-foreground">
                                            Until{" "}
                                            {formatTime(room.availableUntil)}
                                          </p>
                                        )}
                                        {room.nextClass && (
                                          <p className="text-xs text-muted-foreground">
                                            Next: {room.nextClass.course} at{" "}
                                            {formatTime(
                                              room.nextClass.time.start,
                                            )}
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
                          value={`${building.name}-occupied`}
                          ref={(el) => {
                            accordionRefs.current[`${building.name}-occupied`] =
                              el;
                          }}
                        >
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
                                        className={`
                                          ${
                                            isOpeningSoon(
                                              room.availableAt,
                                              room.availableFor,
                                            )
                                              ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                                              : "bg-red-50 text-red-700 border-red-300"
                                          }
                                        `}
                                      >
                                        {isOpeningSoon(
                                          room.availableAt,
                                          room.availableFor,
                                        )
                                          ? "Opening Soon"
                                          : "Occupied"}
                                      </Badge>
                                    </div>
                                    {room.currentClass && (
                                      <p className="text-xs text-muted-foreground">
                                        Current: {room.currentClass.course} -{" "}
                                        {room.currentClass.title}
                                      </p>
                                    )}
                                    {room.availableAt && (
                                      <div className="text-xs text-muted-foreground">
                                        <p>
                                          Available at:{" "}
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
}

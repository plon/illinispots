import { useState } from "react";
import {
  FacilityRoomProps,
  TimeBlockProps,
  RoomScheduleProps,
  FacilityType
} from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { BookOpen, Image as ImageIcon } from "lucide-react";
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
  TooltipProvider,
} from "@/components/ui/HybridTooltip";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import moment from "moment-timezone";
import Image from "next/image";

const TimeBlock = ({ slot }: TimeBlockProps) => {
  const startTime = moment.tz(`1970-01-01T${slot.start}`, "America/Chicago");
  const endTime = moment.tz(`1970-01-01T${slot.end}`, "America/Chicago");

  let durationMinutes = endTime.diff(startTime, "minutes");
  if (durationMinutes < 0) {
    durationMinutes = endTime.add(1, "day").diff(startTime, "minutes");
  }

  const getWidth = () => {
    // Base width for 60 minutes is w-14 (equal to height)
    // Calculate proportional width for any duration
    if (durationMinutes <= 0) return "w-3"; // Minimum width for invalid durations
    
    if (durationMinutes === 15) return "w-3.5"; // 1/4 of height
    if (durationMinutes === 30) return "w-7";   // 1/2 of height
    if (durationMinutes === 60) return "w-14";  // equal to height (h-14)
    
    // For other durations, calculate proportional width
    // Tailwind doesn't support dynamic classes, so we need to map to the closest available width
    const widthRatio = durationMinutes / 60;
    const baseWidth = 14; // w-14 for 60 minutes
    const calculatedWidth = baseWidth * widthRatio;
    
    // Map to closest Tailwind width class
    if (calculatedWidth <= 3) return "w-3";
    if (calculatedWidth <= 3.5) return "w-3.5";
    if (calculatedWidth <= 4) return "w-4";
    if (calculatedWidth <= 5) return "w-5";
    if (calculatedWidth <= 6) return "w-6";
    if (calculatedWidth <= 7) return "w-7";
    if (calculatedWidth <= 8) return "w-8";
    if (calculatedWidth <= 9) return "w-9";
    if (calculatedWidth <= 10) return "w-10";
    if (calculatedWidth <= 11) return "w-11";
    if (calculatedWidth <= 12) return "w-12";
    if (calculatedWidth <= 14) return "w-14";
    if (calculatedWidth <= 16) return "w-16";
    if (calculatedWidth <= 20) return "w-20";
    if (calculatedWidth <= 24) return "w-24";
    if (calculatedWidth <= 28) return "w-28";
    
    return "w-32"; // Max width for very long durations
  };

  return (
    <TooltipProvider delayDuration={50}>
      <HybridTooltip>
        <HybridTooltipTrigger asChild>
          <div
            className={`h-14 border border-border ${getWidth()} ${
              slot.available ? "bg-green-200" : "bg-red-200"
            } hover:opacity-80 transition-opacity`}
          />
        </HybridTooltipTrigger>
        <HybridTooltipContent className="w-fit p-1.5">
          <p className="font-medium text-[13px] leading-tight">
            {startTime.format("hh:mm A")} - {endTime.format("hh:mm A")}
          </p>
          <p className="text-[12px] leading-tight mt-0.5">
            {slot.available ? "Available" : "Reserved"}
          </p>
          <p className="text-[12px] leading-tight">{durationMinutes} minutes</p>
        </HybridTooltipContent>
      </HybridTooltip>
    </TooltipProvider>
  );
};

const RoomSchedule = ({ slots }: RoomScheduleProps) => {
  // Get the most common slot duration to display in the UI
  const getSlotDurations = () => {
    if (slots.length === 0) return { common: 0, all: [] };

    // Calculate durations for all slots
    const durations = slots.map(slot => {
      const startTime = moment.tz(`1970-01-01T${slot.start}`, "America/Chicago");
      const endTime = moment.tz(`1970-01-01T${slot.end}`, "America/Chicago");

      let duration = endTime.diff(startTime, "minutes");
      if (duration < 0) {
        duration = endTime.add(1, "day").diff(startTime, "minutes");
      }

      return duration;
    });

    // Find the most common duration
    const durationCounts = durations.reduce((acc, duration) => {
      acc[duration] = (acc[duration] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    let maxCount = 0;
    let commonDuration = 0;
    
    Object.entries(durationCounts).forEach(([duration, count]) => {
      if (count > maxCount) {
        maxCount = count;
        commonDuration = parseInt(duration);
      }
    });

    // Get unique durations
    const uniqueDurations = Array.from(new Set(durations)).sort((a, b) => a - b);

    return { 
      common: commonDuration,
      all: uniqueDurations
    };
  };

  const { common: commonDuration, all: allDurations } = getSlotDurations();
  const hasMixedDurations = allDurations.length > 1;

  return (
    <div className="mt-2">
      <ScrollArea className="w-full">
        <div className="flex flex-wrap gap-1">
          {slots.map((slot, index) => (
            <TimeBlock key={index} slot={slot} />
          ))}
        </div>
      </ScrollArea>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-200" />
          <span className="text-xs text-muted-foreground">Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-200" />
          <span className="text-xs text-muted-foreground">Reserved</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {hasMixedDurations ? (
          <>
            Mixed durations: {allDurations.join(', ')} minutes
          </>
        ) : (
          <>
            {commonDuration}-minute reservations
          </>
        )}
      </p>
    </div>
  );
};

export default function FacilityRoomDetails({
  roomName,
  room,
  facilityType
}: FacilityRoomProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);
  
  // Only show library-specific UI for library rooms
  if (facilityType === FacilityType.LIBRARY && room.url && room.slots) {
    return (
      <div className="px-4 py-2">
        <div className="flex gap-2 mb-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a href={room.url} target="_blank" rel="noopener noreferrer">
              <BookOpen className="w-4 h-4 mr-2" />
              Reserve
            </a>
          </Button>
          {room.thumbnail && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <ImageIcon className="w-4 h-4" />
                  <span className="sr-only">View room image</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="p-5">
                <div className="relative w-full aspect-video">
                  {isImageLoading && (
                    <div className="absolute inset-0 w-full h-full bg-gray-300 animate-pulse rounded-md" />
                  )}
                  <Image
                    src={room.thumbnail}
                    alt={`${roomName} thumbnail`}
                    fill
                    className="object-cover rounded-md"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                    onLoadingComplete={() => setIsImageLoading(false)}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <RoomSchedule slots={room.slots} />
      </div>
    );
  }
  
  // Academic building room - we don't need a detailed view for these currently
  return (
    <div className="px-4 py-2 text-sm">
      <p className="text-muted-foreground">
        Room details not available for academic buildings.
      </p>
    </div>
  );
}

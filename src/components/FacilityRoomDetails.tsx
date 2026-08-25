import { useState } from "react";
import {
  FacilityRoomProps,
  TimeBlockProps,
  RoomScheduleProps,
  LibraryRoom,
} from "@/types";
import { SCHEDULE_BLOCK_STYLES } from "@/utils/scheduleUtils";
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
import { formatTimeForDisplay, getDurationMinutes } from "@/utils/time";

const TimeBlock = ({ slot }: TimeBlockProps) => {
  const durationMinutes = getDurationMinutes(slot.start, slot.end, true);

  const getWidth = () => {
    // Base width for 60 minutes is w-14 (equal to height)
    // Calculate proportional width for any duration
    if (durationMinutes <= 0) return "w-3"; // Minimum width for invalid durations

    // Map of durations (in minutes) to Tailwind width classes
    const durationWidthMap = [
      [15, "w-3.5"], // 1/4 of height
      [30, "w-7"], // 1/2 of height
      [60, "w-14"], // equal to height (h-14)
      [90, "w-20"], // 1.5x height
      [120, "w-24"], // 2x height
      [180, "w-28"], // 3x height
      [240, "w-32"], // 4x height
    ] as const;

    // Find the closest width class for the given duration
    for (const [duration, width] of durationWidthMap) {
      if (durationMinutes <= duration) {
        return width;
      }
    }

    return "w-32"; // Max width for very long durations
  };

  return (
    <TooltipProvider delayDuration={50}>
      <HybridTooltip>
        <HybridTooltipTrigger asChild>
          <div
            className={`h-14 border border-border ${getWidth()} ${
              slot.available
                ? SCHEDULE_BLOCK_STYLES.available
                : SCHEDULE_BLOCK_STYLES.occupied
            } transition-colors duration-150`}
          />
        </HybridTooltipTrigger>
        <HybridTooltipContent className="w-fit p-1.5">
          <p className="font-medium text-[13px] leading-tight">
            {formatTimeForDisplay(slot.start)} - {formatTimeForDisplay(slot.end)}
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

export const RoomSchedule = ({ slots }: RoomScheduleProps) => {
  return (
    <div className="mt-2">
      <ScrollArea className="w-full">
        <div className="flex flex-wrap gap-1">
          {slots.map((slot, index) => (
            <TimeBlock key={index} slot={slot} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default function FacilityRoomDetails({
  roomName,
  room,
}: FacilityRoomProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);

  // Use the discriminated union to determine room type
  if (room.type === "library") {
    const libraryRoom = room as LibraryRoom;
    return (
      <div className="px-4 py-2">
        <div className="flex gap-2 mb-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a href={libraryRoom.url} target="_blank" rel="noopener noreferrer">
              <BookOpen className="w-4 h-4 mr-2" />
              Reserve
            </a>
          </Button>
          {libraryRoom.thumbnail && (
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
                    <div className="absolute inset-0 w-full h-full bg-muted animate-pulse rounded-md" />
                  )}
                  <img
                    src={libraryRoom.thumbnail}
                    alt={`${roomName} thumbnail`}
                    className="absolute inset-0 h-full w-full rounded-md object-cover"
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setIsImageLoading(false)}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <RoomSchedule slots={libraryRoom.slots} />
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

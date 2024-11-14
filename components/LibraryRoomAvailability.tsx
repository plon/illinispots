import { useState } from "react";
import { RoomReservations } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { BookOpen, Image as ImageIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import moment from "moment-timezone";
import Image from "next/image";

interface TimeBlockProps {
  slot: {
    start: string;
    end: string;
    available: boolean;
  };
}

const TimeBlock = ({ slot }: TimeBlockProps) => {
  const startTime = moment.tz(`1970-01-01T${slot.start}`, "America/Chicago");
  const endTime = moment.tz(`1970-01-01T${slot.end}`, "America/Chicago");

  let durationMinutes = endTime.diff(startTime, "minutes");
  if (durationMinutes < 0) {
    durationMinutes = endTime.add(1, "day").diff(startTime, "minutes");
  }

  const width = Math.max((durationMinutes / 60) * 56, 14);

  return (
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`h-14 border border-border ${
              slot.available ? "bg-green-200" : "bg-red-200"
            } hover:opacity-80 transition-opacity`}
            style={{ width: `${width}px` }}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">
            {startTime.format("hh:mm A")} - {endTime.format("hh:mm A")}
          </p>
          <p className="text-sm">{slot.available ? "Available" : "Reserved"}</p>
          <p className="text-sm">{durationMinutes} minutes</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface RoomScheduleProps {
  slots: {
    start: string;
    end: string;
    available: boolean;
  }[];
}

const RoomSchedule = ({ slots }: RoomScheduleProps) => {
  const getSlotDuration = () => {
    if (slots.length === 0) return 0;

    const firstSlot = slots[0];
    const startTime = moment.tz(
      `1970-01-01T${firstSlot.start}`,
      "America/Chicago",
    );
    const endTime = moment.tz(`1970-01-01T${firstSlot.end}`, "America/Chicago");

    let duration = endTime.diff(startTime, "minutes");
    if (duration < 0) {
      duration = endTime.add(1, "day").diff(startTime, "minutes");
    }

    return duration;
  };

  const slotDuration = getSlotDuration();

  return (
    <div className="mt-2">
      <ScrollArea className="w-full max-w-[336px]">
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
        {slotDuration}-minute reservations
      </p>
    </div>
  );
};

interface LibraryRoomAvailabilityProps {
  roomName: string;
  room: RoomReservations[string];
}

export default function LibraryRoomAvailability({
  roomName,
  room,
}: LibraryRoomAvailabilityProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);

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

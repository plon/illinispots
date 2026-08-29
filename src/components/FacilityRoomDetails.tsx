import { useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  FacilityRoomProps,
  RoomScheduleProps,
  LibraryRoom,
} from "@/types";
import { Button } from "@/components/ui/button";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { TimelineSchedule } from "@/components/TimelineSchedule";
import { convertLibrarySlotsToScheduleBlocks } from "@/utils/timelineSchedule";

export const RoomSchedule = ({ slots }: RoomScheduleProps) => {
  const scheduleBlocks = useMemo(
    () => convertLibrarySlotsToScheduleBlocks(slots),
    [slots],
  );

  return (
    <TimelineSchedule
      scheduleData={scheduleBlocks}
      emptyMessage="No schedule slots available for this room today."
    />
  );
};

export default function FacilityRoomDetails({
  roomName,
  room,
  facilityId,
  facilityName,
}: FacilityRoomProps) {
  const posthog = usePostHog();
  const [isImageLoading, setIsImageLoading] = useState(true);

  // Use the discriminated union to determine room type
  if (room.type === "library") {
    const libraryRoom = room as LibraryRoom;
    return (
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-xs font-medium gap-1.5"
          >
            <a
              href={libraryRoom.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                posthog.capture("library_room_reservation_opened", {
                  facility_id: facilityId,
                  facility_name: facilityName,
                  room_number: roomName,
                });
              }}
            >
              Reserve
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
          {libraryRoom.thumbnail && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs font-medium gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Photo
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

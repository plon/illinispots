import React, { useState } from "react";
import { usePostHog } from "@posthog/react";
import { SearchResultRoom } from "@/utils/searchUtils";
import { AcademicRoom, FacilityType, LibraryRoom, RoomStatus } from "@/types";
import { RoomBadge } from "@/components/RoomBadge";
import { formatDuration } from "@/utils/format";
import { formatTimeForDisplay } from "@/utils/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import AcademicRoomDetailLoader from "@/components/AcademicRoomDetailLoader";
import { RoomSchedule } from "@/components/FacilityRoomDetails";
import { getRoomAvailabilityMessage } from "@/components/FacilityAccordion";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Image as ImageIcon,
  Clock,
} from "lucide-react";

interface RoomSearchResultCardProps {
  roomResult: SearchResultRoom;
}

export const RoomSearchResultCard: React.FC<RoomSearchResultCardProps> = ({
  roomResult,
}) => {
  const posthog = usePostHog();
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  const { room, facility, roomNumber } = roomResult;
  const facilityType = facility.type;
  const isAcademic = facilityType === FacilityType.ACADEMIC;
  const academicRoom = isAcademic ? (room as AcademicRoom) : null;
  const libraryRoom = !isAcademic ? (room as LibraryRoom) : null;

  const toggleSchedule = () => {
    const openingSchedule = !isScheduleOpen;
    setIsScheduleOpen(openingSchedule);
    if (openingSchedule) {
      posthog.capture("room_schedule_viewed", {
        facility_id: facility.id,
        facility_name: facility.name,
        facility_type: facilityType,
        room_number: roomNumber,
        selection_source: "search",
      });
    }
  };

  return (
    <div className="rounded-lg border border-border/80 bg-card p-3.5 shadow-xs hover:border-primary/40 transition-all duration-150 space-y-2.5">
      {/* Header: Room Name & Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-base text-foreground tracking-tight">
            {isAcademic ? `Room ${roomNumber}` : roomNumber}
          </span>

          {/* Building Link */}
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[200px] md:max-w-[260px] font-medium">
              {facility.name}
            </span>
          </div>
        </div>

        {/* Room Status Badge */}
        <div className="shrink-0">
          <RoomBadge status={room.status} facilityType={facilityType} />
        </div>
      </div>

      {/* Availability / Course Status Info */}
      <div className="text-xs space-y-1 bg-muted/30 rounded-md p-2 border border-border/40">
        {isAcademic && academicRoom && (
          <>
            {room.status === RoomStatus.AVAILABLE ||
            room.status === RoomStatus.PASSING_PERIOD ? (
              <div className="space-y-0.5 text-muted-foreground">
                {academicRoom.passingPeriod && (
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    Passing Period
                  </p>
                )}
                {room.availableFor !== undefined && room.availableFor > 0 && (
                  <div className="flex items-center gap-1.5 text-foreground/80">
                    <Clock className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                    <span>
                      Available for{" "}
                      <strong className="text-foreground">
                        {formatDuration(room.availableFor)}
                      </strong>
                      {academicRoom.availableUntil && (
                        <> (until {formatTimeForDisplay(academicRoom.availableUntil)})</>
                      )}
                    </span>
                  </div>
                )}
                {academicRoom.nextClass && (
                  <p className="text-[11px] text-muted-foreground pt-0.5 truncate">
                    <span className="font-medium text-foreground/70">Next:</span>{" "}
                    {academicRoom.nextClass.course} - {academicRoom.nextClass.title}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 text-muted-foreground">
                {academicRoom.currentClass && (
                  <p className="text-[11px] text-foreground/90 truncate">
                    <span className="font-medium text-foreground/70">Current:</span>{" "}
                    {academicRoom.currentClass.course} - {academicRoom.currentClass.title}
                  </p>
                )}
                {academicRoom.availableAt && (
                  <div className="flex items-center gap-1.5 text-foreground/80 pt-0.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>
                      Available at {formatTimeForDisplay(academicRoom.availableAt)}
                      {room.availableFor ? ` for ${formatDuration(room.availableFor)}` : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!isAcademic && libraryRoom && (
          <div className="text-muted-foreground">
            {getRoomAvailabilityMessage(libraryRoom)}
          </div>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex items-center gap-2">
          {/* Schedule Toggle Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleSchedule}
            className="h-8 text-xs font-medium gap-1.5 hover:bg-secondary"
            aria-expanded={isScheduleOpen}
            aria-label={`${isScheduleOpen ? "Hide" : "View"} schedule for room ${roomNumber} in ${facility.name}`}
          >
            <Calendar className="w-3.5 h-3.5" />
            {isScheduleOpen ? "Hide Schedule" : "View Schedule"}
            {isScheduleOpen ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            )}
          </Button>

          {/* Library specific buttons: Reserve & Photo */}
          {!isAcademic && libraryRoom && (
            <>
              {libraryRoom.url && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-medium gap-1.5 hover:bg-secondary"
                >
                  <a
                    href={libraryRoom.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      posthog.capture("library_room_reservation_opened", {
                        facility_id: facility.id,
                        facility_name: facility.name,
                        room_number: roomNumber,
                      })
                    }
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Reserve
                  </a>
                </Button>
              )}

              {libraryRoom.thumbnail && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="View Room Photo"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span className="sr-only">View room photo</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="p-5">
                    <div className="relative w-full aspect-video">
                      {isImageLoading && (
                        <div className="absolute inset-0 w-full h-full bg-muted animate-pulse rounded-md" />
                      )}
                      <img
                        src={libraryRoom.thumbnail}
                        alt={`${roomNumber} thumbnail`}
                        className="absolute inset-0 h-full w-full rounded-md object-cover"
                        loading="lazy"
                        decoding="async"
                        onLoad={() => setIsImageLoading(false)}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </div>
      </div>

      {/* Collapsible Detailed Schedule */}
      {isScheduleOpen && (
        <div className="pt-2 border-t border-border/60 mt-2 w-full min-w-0 max-w-full overflow-hidden">
          {isAcademic ? (
            <AcademicRoomDetailLoader
              buildingId={facility.name}
              roomNumber={roomNumber}
            />
          ) : (
            libraryRoom && <RoomSchedule slots={libraryRoom.slots} />
          )}
        </div>
      )}
    </div>
  );
};

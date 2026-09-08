import React, { memo, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  FacilityRoom,
  FacilityType,
  RoomStatus,
} from "@/types";
import { RoomBadge } from "@/components/RoomBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ChevronDown, ExternalLink, Image as ImageIcon } from "lucide-react";
import AcademicRoomDetailLoader from "@/components/AcademicRoomDetailLoader";
import { RoomSchedule } from "@/components/RoomSchedule";
import {
  getRoomAvailabilityMessage,
  RoomAvailabilityDetails,
  RoomOccupancyDetails,
} from "./roomUtils";

interface RoomRowProps {
  roomName: string;
  room: FacilityRoom;
  facilityId: string;
  facilityName: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const RoomRow: React.FC<RoomRowProps> = memo(
  ({
    roomName,
    room,
    facilityId,
    facilityName,
    isExpanded,
    onToggleExpand,
  }) => {
    const posthog = usePostHog();
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [hasBeenExpanded, setHasBeenExpanded] = useState(isExpanded);

    const academicRoom = room.type === "academic" ? room : null;
    const libraryRoom = room.type === "library" ? room : null;
    const isAcademic = academicRoom !== null;
    const facilityType = isAcademic
      ? FacilityType.ACADEMIC
      : FacilityType.LIBRARY;

    const isAvailable =
      room.status === RoomStatus.AVAILABLE ||
      room.status === RoomStatus.PASSING_PERIOD;

    const handleRowClick = () => {
      const willExpand = !isExpanded;
      if (willExpand) {
        setHasBeenExpanded(true);
        posthog.capture("room_schedule_viewed", {
          facility_id: facilityId,
          facility_name: facilityName,
          facility_type: facilityType,
          room_number: roomName,
          selection_source: "accordion",
        });
      }
      onToggleExpand();
    };

    return (
      <div className="transition-colors">
        <button
          type="button"
          onClick={handleRowClick}
          aria-expanded={isExpanded}
          aria-label={`Room ${roomName} in ${facilityName}`}
          className={`w-full text-left py-2.5 px-4 flex items-center justify-between hover:bg-muted/30 transition-colors gap-2 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
            isExpanded ? "bg-muted/20" : ""
          }`}
        >
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-medium text-sm text-foreground">{roomName}</span>
            {isAcademic && academicRoom && (
              isAvailable ? (
                <RoomAvailabilityDetails room={academicRoom} />
              ) : (
                <RoomOccupancyDetails room={academicRoom} />
              )
            )}
            {!isAcademic && libraryRoom && (
              <div className="mt-0.5">
                {getRoomAvailabilityMessage(libraryRoom)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <RoomBadge
              status={room.status}
              availableAt={room.availableAt}
              availableFor={room.availableFor}
              facilityType={facilityType}
            />
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                isExpanded ? "rotate-180 text-primary" : ""
              }`}
            />
          </div>
        </button>

        <div
          className={`grid transition-all duration-200 ease-out ${
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden">
            {hasBeenExpanded && (
              <div className="border-t border-border/40 bg-muted/20 px-4 py-2.5 min-w-0">
                {isAcademic ? (
                  <AcademicRoomDetailLoader
                    buildingId={facilityName}
                    roomNumber={roomName}
                  />
                ) : libraryRoom ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {libraryRoom.url && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs font-medium gap-1.5 h-7"
                        >
                          <a
                            href={libraryRoom.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.stopPropagation();
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
                      )}
                      {libraryRoom.thumbnail && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs font-medium gap-1.5 h-7"
                              onClick={(e) => e.stopPropagation()}
                            >
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
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

RoomRow.displayName = "RoomRow";

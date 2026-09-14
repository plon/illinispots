import React, { memo, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  type FacilityRoom,
  type RoomDetails,
  FacilityType,
  RoomStatus,
} from "@/types";
import { RoomBadge } from "@/components/RoomBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Info,
} from "lucide-react";
import AcademicRoomDetailLoader from "@/components/AcademicRoomDetailLoader";
import { RoomSchedule } from "@/components/RoomSchedule";
import { getOptimizedImageUrl } from "@/utils/imageUrl";
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
  roomDetails?: RoomDetails;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function seatsSummary(details: RoomDetails): string {
  return [
    details.capacity ? `Seats ${details.capacity}` : null,
    details.roomType || null,
  ]
    .filter(Boolean)
    .join(" • ");
}

function hasTechDetails(details: RoomDetails): boolean {
  return (
    details.equipment.length > 0 ||
    details.photoUrls.length > 0 ||
    details.answersUrl !== null
  );
}

export function restoreOriginalImage(
  event: {
    currentTarget: Pick<HTMLImageElement, "dataset" | "src" | "srcset">;
  },
  originalUrl: string,
) {
  const image = event.currentTarget;
  if (image.dataset.originalFallback === originalUrl) {
    return;
  }
  image.dataset.originalFallback = originalUrl;
  image.srcset = "";
  image.src = originalUrl;
}

function RoomDetailsSection({ details }: { details: RoomDetails }) {
  const summary = seatsSummary(details);
  const photoCount = details.photoUrls.length;
  const [photoIndex, setPhotoIndex] = useState(0);
  const [thumbnailSource] = details.photoUrls;
  const activePhotoSource = details.photoUrls[photoIndex];

  if (!summary && !hasTechDetails(details)) {
    return null;
  }
  return (
    <div className="mt-2 space-y-2 border-t border-border/40 px-1 pt-2 text-xs">
      {summary && <p className="text-muted-foreground">{summary}</p>}
      {details.equipment.length > 0 && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Equipment:</span>{" "}
          {details.equipment.join(", ")}
        </p>
      )}
      {photoCount > 0 && (
        <Dialog
          onOpenChange={(open) => {
            if (open) {
              setPhotoIndex(0);
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`View ${photoCount} room photo${photoCount === 1 ? "" : "s"}`}
              className="group relative block shrink-0 overflow-hidden rounded-md border border-border/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            >
              <img
                src={getOptimizedImageUrl(thumbnailSource, {
                  width: 96,
                  height: 64,
                  fit: "cover",
                })}
                srcSet={`${getOptimizedImageUrl(thumbnailSource, {
                  width: 96,
                  height: 64,
                  fit: "cover",
                })} 1x, ${getOptimizedImageUrl(thumbnailSource, {
                  width: 192,
                  height: 128,
                  fit: "cover",
                })} 2x`}
                alt={`Room photo 1 of ${photoCount}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(event) => restoreOriginalImage(event, thumbnailSource)}
                className="h-16 w-24 object-cover transition group-hover:opacity-90"
              />
              {photoCount > 1 && (
                <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <ImageIcon className="h-2.5 w-2.5" />
                  {photoCount}
                </span>
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle className="sr-only">Room photos</DialogTitle>
            <div className="relative">
              <a
                href={details.photoUrls[photoIndex]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={getOptimizedImageUrl(activePhotoSource, { width: 480 })}
                  srcSet={`${getOptimizedImageUrl(activePhotoSource, {
                    width: 480,
                  })} 480w, ${getOptimizedImageUrl(activePhotoSource, {
                    width: 960,
                  })} 960w`}
                  sizes="(min-width: 640px) 480px, calc(100vw - 4rem)"
                  alt={`Room photo ${photoIndex + 1} of ${photoCount}`}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(event) =>
                    restoreOriginalImage(event, activePhotoSource)
                  }
                  className="w-full rounded-md object-cover"
                />
              </a>
              {photoCount > 1 && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Previous photo"
                    onClick={() =>
                      setPhotoIndex((i) => (i - 1 + photoCount) % photoCount)
                    }
                    className="absolute top-1/2 left-2 h-8 w-8 -translate-y-1/2 rounded-full opacity-90"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Next photo"
                    onClick={() => setPhotoIndex((i) => (i + 1) % photoCount)}
                    className="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 rounded-full opacity-90"
                  >
                    <ChevronRight />
                  </Button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
                    {photoIndex + 1} / {photoCount}
                  </span>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {details.answersUrl && (
        <a
          href={details.answersUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          Tech Services details
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export const RoomRow: React.FC<RoomRowProps> = memo(
  ({
    roomName,
    room,
    facilityId,
    facilityName,
    roomDetails,
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
          selection_source: "facility_detail",
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
          aria-label={`Room ${roomName} in ${facilityName}${roomDetails ? ", has room info" : ""}`}
          className={`w-full text-left py-2.5 px-4 flex items-center justify-between hover:bg-muted/30 transition-colors gap-2 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
            isExpanded ? "bg-muted/20" : ""
          }`}
        >
          <div className="flex flex-col min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-sm text-foreground">
              {roomName}
              {isAcademic && roomDetails && (
                <span
                  title={
                    hasTechDetails(roomDetails)
                      ? "Room info available"
                      : "Seats and room type available"
                  }
                  className="inline-flex shrink-0"
                >
                  <Info
                    aria-hidden="true"
                    className="h-3 w-3 text-muted-foreground/60"
                  />
                </span>
              )}
            </span>
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
                  <>
                    <AcademicRoomDetailLoader
                      buildingId={facilityName}
                      roomNumber={roomName}
                    />
                    {roomDetails && <RoomDetailsSection details={roomDetails} />}
                  </>
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
                          <DialogContent>
                            <DialogTitle className="sr-only">
                              {roomName} photo
                            </DialogTitle>
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

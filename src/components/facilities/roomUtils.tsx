import React from "react";
import {
  FacilityRoom,
  LibraryRoom,
  RoomStatus,
} from "@/types";
import { formatDuration } from "@/utils/format";
import { formatTimeForDisplay } from "@/utils/time";

export type RoomEntry = [roomName: string, room: FacilityRoom];

export const groupAcademicRooms = (rooms: readonly RoomEntry[]) => {
  const availableRooms: RoomEntry[] = [];
  const occupiedRooms: RoomEntry[] = [];

  for (const entry of rooms) {
    switch (entry[1].status) {
      case RoomStatus.AVAILABLE:
      case RoomStatus.PASSING_PERIOD:
        availableRooms.push(entry);
        break;
      case RoomStatus.OCCUPIED:
      case RoomStatus.OPENING_SOON:
        occupiedRooms.push(entry);
        break;
    }
  }

  return { availableRooms, occupiedRooms };
};

export const getRoomAvailabilityMessage = (
  room: LibraryRoom,
): React.ReactNode => {
  if (room.status === RoomStatus.UNAVAILABLE) {
    return <span className="text-xs text-muted-foreground">Unavailable</span>;
  } else if (room.status === RoomStatus.AVAILABLE) {
    if (room.availableFor) {
      return (
        <span className="text-xs text-muted-foreground">
          Available for {formatDuration(room.availableFor)}
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">Available</span>;
  } else if (room.status === RoomStatus.OPENING_SOON && room.availableAt) {
    return (
      <span className="text-xs text-muted-foreground">
        Opens at {formatTimeForDisplay(room.availableAt)}
      </span>
    );
  } else if (room.availableAt) {
    return (
      <span className="text-xs text-muted-foreground">
        Available at {formatTimeForDisplay(room.availableAt)}
        {room.availableFor && ` for ${formatDuration(room.availableFor)}`}
      </span>
    );
  } else {
    return <span className="text-xs text-muted-foreground">Fully booked</span>;
  }
};

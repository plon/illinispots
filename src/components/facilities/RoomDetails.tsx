import React from "react";
import { RoomStatus, type AcademicRoom } from "@/types";
import { formatDuration } from "@/utils/format";
import { formatTimeForDisplay } from "@/utils/time";

export const RoomAvailabilityDetails: React.FC<{ room: AcademicRoom }> = ({
  room,
}) => (
  <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
    {room.status === RoomStatus.PASSING_PERIOD && room.nextClass ? (
      <p>
        <span className="font-medium text-foreground/70">Status:</span> Passing
        Period
      </p>
    ) : (
      <>
        {room.availableFor && (
          <p>
            <span className="font-medium text-foreground/70">
              Available for:
            </span>{" "}
            {formatDuration(room.availableFor)}
          </p>
        )}
        {room.availableUntil && (
          <p>
            <span className="font-medium text-foreground/70">Until:</span>{" "}
            {formatTimeForDisplay(room.availableUntil)}
          </p>
        )}
      </>
    )}
    {room.nextClass && (
      <p className="truncate">
        <span className="font-medium text-foreground/70">Next:</span>{" "}
        {room.nextClass.course} - {room.nextClass.title}
      </p>
    )}
  </div>
);

export const RoomOccupancyDetails: React.FC<{ room: AcademicRoom }> = ({
  room,
}) => (
  <div className="text-xs space-y-0.5 mt-0.5">
    {room.currentClass && (
      <p className="truncate">
        <span className="font-medium text-foreground/70">Current:</span>{" "}
        <span className="font-normal text-muted-foreground">
          {room.currentClass.course} - {room.currentClass.title}
        </span>
      </p>
    )}
    {room.availableAt && (
      <p>
        <span className="font-medium text-foreground/70">Available at:</span>{" "}
        <span className="font-normal text-muted-foreground">
          {formatTimeForDisplay(room.availableAt)}
          {room.availableFor && ` for ${formatDuration(room.availableFor)}`}
        </span>
      </p>
    )}
  </div>
);

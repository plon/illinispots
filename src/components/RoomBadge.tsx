import React, { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { FacilityType, RoomStatus } from "@/types";

interface RoomBadgeProps {
  status: RoomStatus;
  availableAt?: string;
  availableFor?: number;
  facilityType: FacilityType;
}

export const RoomBadge: React.FC<RoomBadgeProps> = memo(
  ({ status, facilityType }) => {
    return (
      <Badge
        variant="outline"
        className={`
          ${
            status === RoomStatus.AVAILABLE
              ? "bg-green-50 text-green-700 border-green-300"
              : status === RoomStatus.PASSING_PERIOD
                ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                : status === RoomStatus.OPENING_SOON
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "bg-red-50 text-red-700 border-red-300"
          }
        `}
      >
        {status === RoomStatus.AVAILABLE
          ? "Available"
          : status === RoomStatus.PASSING_PERIOD
            ? "Passing Period"
            : status === RoomStatus.OPENING_SOON
              ? "Opening Soon"
              : status === RoomStatus.RESERVED &&
                  facilityType === FacilityType.LIBRARY
                ? "Reserved"
                : "Occupied"}
      </Badge>
    );
  },
);

RoomBadge.displayName = "RoomBadge";

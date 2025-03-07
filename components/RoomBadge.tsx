import React, { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { FacilityType } from "@/types";
import moment from "moment-timezone";

interface RoomBadgeProps {
  availableAt?: string;
  availableFor?: number;
  available: boolean;
  passingPeriod?: boolean;
  facilityType: FacilityType;
}

export const RoomBadge: React.FC<RoomBadgeProps> = memo(
  ({ availableAt, availableFor, available, passingPeriod, facilityType }) => {
    const isOpening = useMemo(() => {
      if (!availableAt || !availableFor) return false;
      const [availableHours, availableMinutes] = availableAt.split(":");
      const now = moment().tz("America/Chicago");
      const availableTime = moment()
        .tz("America/Chicago")
        .hours(parseInt(availableHours, 10))
        .minutes(parseInt(availableMinutes, 10))
        .seconds(0);
      const diffInMinutes = availableTime.diff(now, "minutes");
      return diffInMinutes <= 20 && diffInMinutes > 0 && availableFor >= 30;
    }, [availableAt, availableFor]);

    return (
      <Badge
        variant="outline"
        className={`
          ${
            available
              ? passingPeriod
                ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                : "bg-green-50 text-green-700 border-green-300"
              : isOpening
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-red-50 text-red-700 border-red-300"
          }
        `}
      >
        {available
          ? passingPeriod
            ? "Passing Period"
            : "Available"
          : isOpening
            ? "Opening Soon"
            : facilityType === FacilityType.LIBRARY
              ? "Reserved"
              : "Occupied"}
      </Badge>
    );
  },
);

RoomBadge.displayName = "RoomBadge"; 
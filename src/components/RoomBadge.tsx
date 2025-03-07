import React, { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { FacilityType, RoomStatus } from "@/types";

interface RoomBadgeProps {
  status: RoomStatus;
  availableAt?: string;
  availableFor?: number;
  facilityType: FacilityType;
}

const badgeStyles: Record<RoomStatus, string> = {
  [RoomStatus.AVAILABLE]: "bg-green-50 text-green-700 border-green-300",
  [RoomStatus.PASSING_PERIOD]: "bg-yellow-50 text-yellow-700 border-yellow-300",
  [RoomStatus.OPENING_SOON]: "bg-blue-50 text-blue-700 border-blue-300",
  [RoomStatus.RESERVED]: "bg-red-50 text-red-700 border-red-300",
  [RoomStatus.OCCUPIED]: "bg-red-50 text-red-700 border-red-300",
};

const getStatusText = (
  status: RoomStatus,
  facilityType: FacilityType,
): string => {
  const statusTexts: Record<RoomStatus, string> = {
    [RoomStatus.AVAILABLE]: "Available",
    [RoomStatus.PASSING_PERIOD]: "Passing Period",
    [RoomStatus.OPENING_SOON]: "Opening Soon",
    [RoomStatus.RESERVED]:
      facilityType === FacilityType.LIBRARY ? "Reserved" : "Occupied",
    [RoomStatus.OCCUPIED]: "Occupied",
  };

  return statusTexts[status];
};

export const RoomBadge: React.FC<RoomBadgeProps> = memo(
  ({ status, facilityType }) => {
    return (
      <Badge variant="outline" className={badgeStyles[status]}>
        {getStatusText(status, facilityType)}
      </Badge>
    );
  },
);

RoomBadge.displayName = "RoomBadge";
